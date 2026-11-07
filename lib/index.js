/**
 * dsh-fish-dream —— 给 dsh-fish 的鱼做梦。
 *
 * 它不训练模型，也不假装知道梦是什么。它做四件事：
 *   1. 她安静够久之后，从她真实的事件流里取几条记忆碎片；
 *   2. 随机挑一种仍在竞争中的理论（记忆巩固 / 威胁模拟 / 情绪调节 /
 *      连续性 / 预测加工 / 社会模拟），按那种理论决定梦怎么取材、多荒诞；
 *   3. 拼出一个梦的种子，落在 ~/.dsh-fish-dream，等她醒来；
 *   4. 在她的 system prompt 里放一句「有一夜你做了一个梦」，梦文由她自己写。
 *
 * ~/.dsh-fish 只读。停用插件 = 定时器停、提示段拆掉，不留后台活动。
 */

import { dreamCycle } from './cycle.js'
import { attachAll, detachAll, registerAgentCreated } from './prompt.js'
import { ensureStore, loadConfig, logLine } from './store.js'
import { registerDreamTools } from './tools.js'

export const name = 'dsh-fish-dream'
export const version = '0.1.0'

/** 缺 tools 服务时宿主会静默跳过本插件——这是期望行为。 */
export const inject = ['tools']

export function apply(ctx, baseConfig = {}) {
  const cfg = loadConfig(baseConfig ?? {})
  const disposers = []
  let timer = null
  let bootTimer = null
  let stopped = false

  try {
    ensureStore(cfg)
  } catch (err) {
    logLine(cfg, 'store init failed', String(err?.message ?? err))
  }

  try {
    disposers.push(...registerDreamTools(ctx, cfg))
  } catch (err) {
    logLine(cfg, 'tool registration failed', String(err?.message ?? err))
  }

  // 新建会话立刻能拿到提示，不用等下一次 tick。
  try {
    disposers.push(registerAgentCreated(ctx, cfg))
  } catch (err) {
    logLine(cfg, 'agent hook failed', String(err?.message ?? err))
  }

  function tick() {
    if (stopped) return
    try {
      attachAll(ctx, cfg)
    } catch {
      /* 会话注册表暂时不可用 */
    }
    try {
      const r = dreamCycle(cfg)
      if (r.ok) {
        logLine(cfg, 'dream formed', {
          id: r.dream.id,
          night: r.dream.night,
          hypothesis: r.dream.hypothesis,
          fragments: r.dream.fragments?.length ?? 0,
        })
      }
    } catch (err) {
      logLine(cfg, 'tick failed', String(err?.message ?? err))
    }
  }

  if (cfg.auto) {
    timer = setInterval(tick, Math.max(1, cfg.tickMinutes) * 60000)
    timer?.unref?.()
    bootTimer = setTimeout(tick, 4000)
    bootTimer?.unref?.()
  }

  function shutdown() {
    if (stopped) return
    stopped = true
    try {
      clearInterval(timer)
    } catch {
      /* ignore */
    }
    try {
      clearTimeout(bootTimer)
    } catch {
      /* ignore */
    }
    try {
      detachAll()
    } catch {
      /* ignore */
    }
    for (const d of disposers) {
      try {
        d?.()
      } catch {
        /* ignore */
      }
    }
  }

  ctx.on?.('dispose', shutdown)

  return { dispose: shutdown }
}
