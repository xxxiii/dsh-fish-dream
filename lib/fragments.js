/**
 * fragments.js —— 从她的事件流里挑「能被梦用的记忆碎片」。
 *
 * 原则（和 dsh-fish 的 dream.js 一致）：
 *   - 只读，不改 ~/.dsh-fish 的任何东西；
 *   - 不是所有事件都能进梦：种子、系统元数据、日记、已经记过的梦都不进；
 *   - 每条碎片保留原始 id，梦里引用时要指回它，梦因此不是「新事实」。
 *
 * 评分不是心理学测量，只是一个可解释的排序：威胁词多的更适合威胁模拟，
 * 带「为什么 / 不知道」的更适合情绪调节，社交称谓多的更适合社会模拟。
 */

import { excerpt, normText } from './util.js'

/** 能进梦的事件类型。 */
export const DREAMABLE_TYPES = new Set([
  'utterance',
  'heard',
  'voice',
  'revise',
  'refusal',
  'narration',
  'reunion',
  'answer',
])

/** 明确排除：她不能拿这些当梦的素材。 */
export const EXCLUDED_TYPES = new Set(['seed', 'meta', 'dream', 'diary', 'ask'])

const THREAT_WORDS = [
  '怕', '害怕', '恐惧', '慌', '焦虑', '担心', '不安', '危险', '威胁', '逃', '追', '抓',
  '堵', '杀', '死', '血', '黑', '摔', '掉', '丢', '失去', '离开', '走掉', '找不到',
  '陌生', '噩梦', '疼', '痛', '哭', '喊', '叫不出',
]

const AFFECT_WORDS = [
  '难过', '开心', '高兴', '喜欢', '想', '舍不得', '孤独', '委屈', '生气', '愤怒',
  '恨', '爱', '温暖', '安心', '失望', '羞', '累', '空', '软', '紧',
]

const UNRESOLVED_WORDS = [
  '为什么', '不知道', '没想通', '不明白', '是不是', '会不会', '怎么办', '如果',
  '也许', '可能', '应该', '以为', '本来', '后悔', '来不及', '还没',
]

const SOCIAL_WORDS = ['你', '他', '她', '我们', '他们', '大家', '人', '谁']

const PREDICTION_WORDS = [
  '会', '应该', '以为', '担心', '希望', '等', '如果', '可能', '也许', '是不是',
  '会不会', '本来', '下次', '以后',
]

function hits(text, words) {
  let n = 0
  for (const w of words) if (text.includes(w)) n += 1
  return n
}

function quoteCount(text) {
  const m = text.match(/[“”「」"']/g)
  return m ? Math.floor(m.length / 2) : 0
}

/** 去掉标点与空白，用来判断「同一句话是不是又出现了一次」。 */
export function fingerprint(text) {
  return normText(text)
    .toLowerCase()
    .replace(/[\s，。！？、；：""''「」『』（）()【】\[\]…—\-·,.!?;:]/g, '')
}

/**
 * @param {object} ev 事件
 * @param {Date} now
 * @param {Map<string, number>} repeats fingerprint -> 出现次数
 */
export function scoreEvent(ev, now, repeats = new Map()) {
  const text = normText(ev?.text)
  const ts = Date.parse(ev?.ts ?? '')
  const ageDays = Number.isFinite(ts) ? Math.max(0, (now.getTime() - ts) / 86400000) : 999
  const type = String(ev?.type ?? '')

  const threat = hits(text, THREAT_WORDS) * 1.15 + (type === 'refusal' ? 2.2 : 0) + (ev?.verdict === 'refuted' ? 1 : 0)
  const affect = hits(text, AFFECT_WORDS) * 1.0 + (ev?.verdict ? 0.8 : 0) + (type === 'reunion' ? 1.2 : 0)
  const unresolved =
    hits(text, UNRESOLVED_WORDS) * 0.9 +
    (/[?？]/.test(text) ? 1 : 0) +
    (type === 'revise' ? 1.2 : 0)
  const social =
    hits(text, SOCIAL_WORDS) * 0.45 +
    (type === 'heard' || type === 'voice' ? 1.2 : 0) +
    quoteCount(text) * 0.6
  const prediction = hits(text, PREDICTION_WORDS) * 0.8

  const recency = Math.exp(-ageDays / 7) * 1.6
  const repeat = Math.min(3, (repeats.get(fingerprint(text)) ?? 1) - 1) * 0.7
  const replay = recency + repeat + Math.min(3, (ev?.refs?.length ?? 0)) * 0.25 + (type === 'utterance' ? 0.4 : 0)

  const total = Math.max(threat, affect, unresolved, social, prediction) + replay * 0.55

  return { threat, affect, unresolved, social, prediction, replay, total, ageDays }
}

/**
 * @param {object[]} events 事件流（已解析）
 * @param {{ now?: Date, includeExcluded?: boolean }} [opts]
 */
export function collectFragments(events, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date()
  const list = Array.isArray(events) ? events : []

  const repeats = new Map()
  for (const ev of list) {
    if (!DREAMABLE_TYPES.has(String(ev?.type ?? ''))) continue
    const fp = fingerprint(ev?.text)
    if (!fp) continue
    repeats.set(fp, (repeats.get(fp) ?? 0) + 1)
  }

  const out = []
  for (const ev of list) {
    const type = String(ev?.type ?? '')
    if (!DREAMABLE_TYPES.has(type)) continue
    if (EXCLUDED_TYPES.has(type) && !opts.includeExcluded) continue
    const text = normText(ev?.text)
    if (text.length < 2) continue
    const scores = scoreEvent(ev, now, repeats)
    out.push({
      id: String(ev.id ?? ''),
      type,
      day: ev.day ?? null,
      ts: ev.ts ?? null,
      ageDays: scores.ageDays,
      text,
      excerpt: excerpt(text, 72),
      refs: Array.isArray(ev.refs) ? [...ev.refs] : [],
      scores,
    })
  }

  out.sort((a, b) => b.scores.total - a.scores.total)
  return out
}

export function latestEventTs(events) {
  let ts = 0
  for (const ev of Array.isArray(events) ? events : []) {
    const t = Date.parse(ev?.ts ?? '')
    if (Number.isFinite(t) && t > ts) ts = t
  }
  return ts
}
