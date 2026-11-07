/**
 * cycle.js —— 一次做梦的完整流程：事件流 → 碎片 → 抽假说 → 拼种子 → 落库。
 *
 * 什么时候来：看「距离最后一次对话多久」，查 sleep.js 里那张表。
 * 表里的概率是每一次检查掷中的概率；同一段沉默最多一场梦。
 */

import { composeSeed } from './compose.js'
import { collectFragments } from './fragments.js'
import { hypothesisById, pickFragments, pickHypothesis } from './hypotheses.js'
import { lastConversationTs, shouldFormDream } from './sleep.js'
import { formDream, pendingDream, readFishEvents, readState } from './store.js'
import { localDateKey, mulberry32, seedOf } from './util.js'

/**
 * 检查一次；条件不满足或没掷中就什么都不做。
 * @param {object} cfg
 * @param {{ now?: Date, rng?: () => number, events?: object[], force?: boolean, hypothesisId?: string }} [opts]
 */
export function dreamCycle(cfg, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date()
  const events = Array.isArray(opts.events) ? opts.events : readFishEvents(cfg)
  const fragments = collectFragments(events, { now })
  const talkTs = lastConversationTs(events)

  if (!opts.force) {
    const existing = pendingDream(cfg)
    if (existing) return { ok: false, why: 'pending', dream: existing }

    const gate = shouldFormDream({
      now,
      cfg,
      state: readState(cfg),
      lastConversationTs: talkTs,
      fragmentCount: fragments.length,
    })
    if (!gate.ok) return { ok: false, why: gate.why, hours: gate.hours }

    const rng = opts.rng ?? seededRng(gate.hibernationStart, gate.hours, events)
    if (rng() >= gate.chance) {
      return { ok: false, why: 'rolled out', chance: gate.chance, hours: gate.hours }
    }
    return form(cfg, {
      now,
      fragments,
      night: gate.night,
      rng,
      hypothesisId: opts.hypothesisId,
      sleep: { hours: gate.hours, hibernation: gate.hibernationStart },
    })
  }

  // force（dream_now）：不看表、不掷骰，直接拼一场。
  return form(cfg, {
    now,
    fragments,
    night: localDateKey(now),
    rng: opts.rng ?? seededRng(localDateKey(now), 0, events),
    hypothesisId: opts.hypothesisId,
    sleep: {
      hours: Number.isFinite(talkTs) ? (now.getTime() - talkTs) / 3600000 : 0,
      hibernation: Number.isFinite(talkTs) ? new Date(talkTs).toISOString() : now.toISOString(),
    },
  })
}

function seededRng(hibernationStart, hours, events) {
  const tail = events.length ? String(events[events.length - 1]?.id ?? '') : ''
  // 每 15 分钟换一次种子：同一段沉默里，每次检查都是独立的一次掷骰。
  const slot = Math.floor((Number(hours) || 0) * 4)
  return mulberry32(seedOf('dsh-fish-dream', hibernationStart ?? '', slot, events.length, tail))
}

function form(cfg, { now, fragments, night, rng, hypothesisId, sleep }) {
  if (fragments.length < Math.max(2, cfg.minFragments ?? 2)) {
    return { ok: false, why: 'not enough fragments' }
  }
  const h = (hypothesisId && hypothesisById(hypothesisId)) || pickHypothesis(rng, cfg.weights)
  const picked = pickFragments(h, fragments, rng)
  if (picked.length < 2) return { ok: false, why: 'not enough fragments' }

  const seed = composeSeed({ hypothesis: h, fragments: picked, night, rng, cfg, sleep })
  const dream = formDream(cfg, seed, now)
  return { ok: true, dream }
}
