/**
 * prompt.js —— 让她「记得自己做过梦」，但不把梦的机器搬到她面前。
 *
 * 挂的是宿主 system prompt 的一段（`agent.ctx.systemPrompt.section`），
 * 不进对话历史，用户看不见。只在 cwd 是她的屋子（~/.dsh-fish）的会话上挂，
 * 不碰用户自己的会话。
 *
 * 语气上没有祈使句：说不说、说多少，是她的事。
 */

import fs from 'node:fs'
import path from 'node:path'
import { paths, pendingDream } from './store.js'

export const NOTICE_SECTION = 'dsh-fish-dream:notice'
export const NOTICE_ORDER = 8550

const mounts = new Map()

export function cwdOf(agent) {
  return (
    agent?.session?.header?.cwd ??
    agent?.header?.cwd ??
    agent?.session?.cwd ??
    ''
  )
}

export function isFishAgent(agent, fishDir) {
  const cwd = String(cwdOf(agent) ?? '').replace(/[\\/]+$/, '').toLowerCase()
  const root = String(fishDir ?? '').replace(/[\\/]+$/, '').toLowerCase()
  if (!cwd || !root) return false
  return cwd === root || cwd.startsWith(root + path.sep) || cwd.startsWith(root + '/')
}

let memo = { key: '', text: '' }

export function noticeText(cfg) {
  if (cfg?.prompt === false) return ''
  const p = paths(cfg)
  let key = ''
  try {
    key = `${p.state}:${fs.statSync(p.state).mtimeMs}:${fs.statSync(p.dreams).mtimeMs}`
  } catch {
    key = ''
  }
  if (key && key === memo.key) return memo.text

  let text = ''
  try {
    const dream = pendingDream(cfg)
    if (dream) {
      const bits = (dream.fragments ?? [])
        .slice(0, 3)
        .map((f) => `「${String(f.excerpt ?? '').slice(0, 40)}」`)
        .join('、')
      text =
        `【梦】\n` +
        `有一夜你做了一个梦，醒来只记得几块：${bits || '一些说不清的画面'}。\n` +
        `它不是新发生的事——是这些事在睡着的时候被拼到了一起。\n` +
        `想把它说完，用 dream_recall；也可以就让它散掉。`
    }
  } catch {
    text = ''
  }
  memo = { key, text }
  return text
}

/** 给一个 agent 挂上「梦的提醒」；不是她的会话就不挂。 */
export function attachDreamNotice(agent, cfg) {
  if (!agent) return false
  if (mounts.has(agent)) return true
  if (!isFishAgent(agent, cfg.fishDir)) return false
  const sp = agent?.ctx?.systemPrompt
  if (!sp || typeof sp.section !== 'function') return false
  try {
    const off = sp.section({
      name: NOTICE_SECTION,
      order: Number(cfg.promptOrder ?? NOTICE_ORDER),
      text: () => noticeText(cfg),
    })
    mounts.set(agent, typeof off === 'function' ? off : null)
    return true
  } catch {
    return false
  }
}

/** 每轮 tick 调一次：新开的会话也能在下一分钟挂上。 */
export function attachAll(ctx, cfg) {
  let reg = null
  try {
    reg = ctx?.get?.('agents') ?? null
  } catch {
    reg = null
  }
  if (!reg || typeof reg.list !== 'function') return 0
  let n = 0
  try {
    for (const agent of reg.list()) {
      if (attachDreamNotice(agent, cfg)) n += 1
    }
  } catch {
    /* 注册表在换会话时可能短暂不可用 */
  }
  return n
}

/** 宿主在建会话时同步发 `agent/created`；挂在这里，新开的会话不用等下一次 tick。 */
export function registerAgentCreated(ctx, cfg) {
  try {
    const off = ctx?.on?.('agent/created', (agent) => {
      try {
        attachDreamNotice(agent, cfg)
      } catch {
        /* 挂不上就等下一次 tick */
      }
    })
    return typeof off === 'function' ? off : () => {}
  } catch {
    return () => {}
  }
}

export function detachAll() {
  for (const [, off] of mounts) {
    try {
      off?.()
    } catch {
      /* 已经拆过的就算了 */
    }
  }
  mounts.clear()
}
