/**
 * tools.js —— 她这一侧能碰到的三只手：接住梦、记下梦、立刻做一个（调试用）。
 *
 * 工具描述是给她看的，用「梦」的说法，不暴露权重、假说 id 这些机器。
 * 回执极短，避免她把回执当成自己的话继续往下说（和 dsh-fish 的约定一致）。
 */

import { dreamCycle } from './cycle.js'
import { pendingDream, recentDreams, recordDream } from './store.js'
import { clamp } from './util.js'

const defineTool = (spec) => spec

function textOf(out) {
  const pieces = Array.isArray(out) ? out : [out]
  return pieces
    .map((p) => (typeof p === 'string' ? p : p?.text ?? ''))
    .join('\n')
}

function renderRecent(list) {
  if (!list.length) return '还没有记下来的梦。'
  return [
    '最近的梦：',
    ...list.map((d) => `\n· ${d.night}\n${d.text}`),
  ].join('\n')
}

export function registerDreamTools(ctx, cfg) {
  const disposers = []

  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'dream_recall',
        description:
          '醒来时把梦接住。如果有一场还没说完的梦，会给你梦的种子：场景、人、感觉、一条荒诞规则、三段走向，' +
          '以及它拼自哪几件真实发生过的事（带 id）。没有梦可接时，返回最近记下来的梦。',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 20,
              description: '没有梦可接时，返回几条最近的梦。默认 3。',
            },
          },
          additionalProperties: false,
        },
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, out) => {
            if (out?.pending?.seed) {
              return [
                {
                  type: 'text',
                  text: out.pending.seed + '\n\n（写完之后用 dream_record 记下来，refs 填上面那几个 id。）',
                },
              ]
            }
            return [{ type: 'text', text: renderRecent(out?.recent ?? []) }]
          },
        },
        async execute(args) {
          const p = pendingDream(cfg)
          if (p) {
            return {
              ok: true,
              pending: {
                id: p.id,
                night: p.night,
                seed: p.seedText,
                fragments: p.fragments ?? [],
              },
              recent: [],
            }
          }
          const limit = clamp(Number(args?.limit) || 3, 1, 20)
          return { ok: true, pending: null, recent: recentDreams(cfg, limit) }
        },
      }),
    ),
  )

  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'dream_record',
        description:
          '把刚才那个梦写下来。第一人称、现在时；不要解释，也不要把它写成故事。' +
          'refs 填 dream_recall 给你的碎片 id——梦只能重拼真实发生过的事，不能添加新事实。',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: `梦的内容，${cfg.maxChars} 字以内。` },
            refs: {
              type: 'array',
              items: { type: 'string' },
              description: '这条梦拼自哪几件事：填它们的 id（1–6 条）。不填就用种子里的全部碎片。',
            },
          },
          required: ['text'],
          additionalProperties: false,
        },
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, out) => [{ type: 'text', text: out?.ok ? '[记下了]' : `[没记下：${out?.note ?? ''}]` }],
        },
        async execute(args, exec) {
          const sessionId = exec?.sessionId ?? exec?.agent?.session?.header?.id ?? null
          try {
            return recordDream(cfg, { text: args?.text, refs: args?.refs, sessionId })
          } catch (err) {
            return { ok: false, note: '这条没记下。' }
          }
        },
      }),
    ),
  )

  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'dream_now',
        description:
          '不等沉默够，立刻拼一个梦。调试用；平时梦会在她安静够久之后自己出现。',
        parameters: {
          type: 'object',
          properties: {
            hypothesis: {
              type: 'string',
              enum: [
                'memory_consolidation',
                'threat_simulation',
                'emotion_regulation',
                'continuity',
                'predictive_processing',
                'social_simulation',
              ],
              description: '指定用哪一种理论拼；不填就按权重随机。',
            },
          },
          additionalProperties: false,
        },
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, out) =>
            out?.ok
              ? [{ type: 'text', text: out.dream.seedText }]
              : [{ type: 'text', text: `[没有做成：${out?.why ?? ''}]` }],
        },
        async execute(args) {
          const r = dreamCycle(cfg, { force: true, hypothesisId: args?.hypothesis })
          if (!r.ok) return { ok: false, why: r.why, dream: r.dream ?? null }
          return { ok: true, dream: { id: r.dream.id, night: r.dream.night, seedText: r.dream.seedText } }
        },
      }),
    ),
  )

  return disposers
}

export { textOf }
