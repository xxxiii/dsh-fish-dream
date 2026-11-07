/**
 * sleep.js —— 梦什么时候来：按「距离最后一次对话多久」查表。
 *
 *   少于 2 小时   0%
 *   2–4 小时      5%
 *   4–6 小时      15%
 *   6–8 小时      30%
 *   8–12 小时     50%
 *   12–18 小时    65%
 *   18–24 小时    75%
 *   24–48 小时    85%
 *   超过 48 小时  90%
 *
 * 表里的概率是「这一次检查（每 tickMinutes 一次）掷中的概率」，不是累计概率。
 * 同一段沉默最多一场梦：醒来后没有新的对话，就不会再冒出第二场。
 *
 * 纯函数，不碰文件、不看钟。
 */

import { localDateKey } from './util.js'

/** 算「对话」的事件类型：他说的、她说的、她读出来的。meta / diary / dream 不算。 */
export const TALK_TYPES = new Set(['heard', 'utterance', 'voice'])

export const DEFAULT_TABLE = [
  [2, 0],
  [4, 0.05],
  [6, 0.15],
  [8, 0.3],
  [12, 0.5],
  [18, 0.65],
  [24, 0.75],
  [48, 0.85],
  [Infinity, 0.9],
]

/** 最近一次对话发生在什么时候（ms）；没有对话返回 null。 */
export function lastConversationTs(events) {
  let ts = null
  for (const e of events ?? []) {
    if (!TALK_TYPES.has(String(e?.type))) continue
    const t = Date.parse(e?.ts ?? '')
    if (!Number.isFinite(t)) continue
    if (ts == null || t > ts) ts = t
  }
  return ts
}

/** 沉默了多久（小时）。没有对话记录就是 Infinity。 */
export function silenceHours(now, lastTs) {
  if (!Number.isFinite(lastTs)) return Infinity
  return Math.max(0, (now.getTime() - lastTs) / 3600000)
}

function toHours(v, isLast) {
  if (v == null) return isLast ? Infinity : NaN
  if (typeof v === 'string' && /^(inf|infinity|∞)$/i.test(v.trim())) return Infinity
  const n = Number(v)
  if (n === Infinity) return Infinity
  return Number.isFinite(n) && n > 0 ? n : NaN
}

/**
 * 把配置里的 [[小时, 概率], …] 洗干净：支持 Infinity / "inf" / null，
 * 去掉坏值、按小时排序、同阈值保留最后一个，末尾补一行无限。
 */
export function normalizeTable(table, fallback = DEFAULT_TABLE) {
  const raw = Array.isArray(table) ? table : []
  const rows = raw
    .map((r, i) => (Array.isArray(r) ? [toHours(r[0], i === raw.length - 1), Number(r[1])] : null))
    .filter((r) => r && Number.isFinite(r[1]) && (r[0] === Infinity || Number.isFinite(r[0])))
    .map(([h, p]) => [h, Math.min(1, Math.max(0, p))])
    .sort((a, b) => a[0] - b[0])
  const dedup = []
  for (const row of rows) {
    const last = dedup[dedup.length - 1]
    if (last && last[0] === row[0]) dedup[dedup.length - 1] = row
    else dedup.push(row)
  }
  if (!dedup.length) return fallback
  if (dedup[dedup.length - 1][0] !== Infinity) {
    dedup.push([Infinity, dedup[dedup.length - 1][1]])
  }
  return dedup
}

/** 沉默这么多小时时，这一次检查掷中的概率。 */
export function dreamChance(hours, table) {
  const t = normalizeTable(table)
  if (!Number.isFinite(hours)) return t[t.length - 1][1]
  for (const [h, p] of t) if (hours < h) return p
  return t[t.length - 1][1]
}

/**
 * 这一刻该不该检查一场梦。纯函数。
 *
 * @param {object} p
 * @param {Date} p.now
 * @param {object} p.cfg
 * @param {object} p.state      state.json
 * @param {number|null} p.lastConversationTs
 * @param {number} p.fragmentCount
 * @returns {{ ok: boolean, why?: string, hours?: number, chance?: number,
 *            hibernationStart?: string, night?: string }}
 */
export function shouldFormDream({ now, cfg, state, lastConversationTs: lastTs, fragmentCount }) {
  if (!cfg?.auto) return { ok: false, why: 'auto off' }

  const hours = silenceHours(now, lastTs)
  const chance = dreamChance(hours, cfg?.dreamTable)
  if (!(chance > 0)) return { ok: false, why: 'awake', hours, chance: 0 }

  if (state?.pendingId) return { ok: false, why: 'pending', hours }

  // 同一段沉默只做一场：休眠的起点就是「最后一句对话」。
  if (lastTs != null && state?.lastHibernation) {
    const prev = Date.parse(state.lastHibernation)
    if (Number.isFinite(prev) && Math.abs(prev - lastTs) < 60000) {
      return { ok: false, why: 'already dreamed this sleep', hours }
    }
  }

  if ((fragmentCount ?? 0) < (cfg?.minFragments ?? 3)) {
    return { ok: false, why: 'not enough fragments', hours }
  }

  const staleDays = Number(cfg?.staleDays ?? 5)
  if (Number.isFinite(lastTs) && hours > staleDays * 24) {
    return { ok: false, why: 'nothing recent to dream about', hours }
  }

  return {
    ok: true,
    hours,
    chance,
    hibernationStart: new Date(lastTs).toISOString(),
    night: localDateKey(now),
  }
}
