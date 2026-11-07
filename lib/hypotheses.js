/**
 * hypotheses.js —— 六种「梦为什么长这样」的理论，各对应一种拼梦策略。
 *
 * 科学界没有定论：这些是竞争中的功能假说，不是六个已证实的模块。
 * 插件做的事不是判定谁对，而是每次随机挑一个，让梦的**取材方式**不同：
 * 同一个人的同一段日子，在威胁模拟里长成被追的巷子，在连续性假说里
 * 长成他常坐的那把椅子旁边。梦因此不是随机的，也不是固定的。
 *
 * 引用只用来标明出处，不代表这些作者认可本实现。
 */

import { pickWeighted, shuffle, uniqueBy } from './util.js'

function jitterRank(frags, scoreOf, rng) {
  return frags
    .map((f) => ({ f, s: Math.max(0, scoreOf(f)) * (0.8 + rng() * 0.4) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.f)
}

function fill(selected, pool, n, rng) {
  const out = uniqueBy(selected, (f) => f.id)
  if (out.length >= n) return out.slice(0, n)
  for (const f of shuffle(pool, rng)) {
    if (out.length >= n) break
    if (!out.some((x) => x.id === f.id)) out.push(f)
  }
  return out
}

export const HYPOTHESES = [
  {
    id: 'memory_consolidation',
    name: '记忆巩固',
    en: 'memory consolidation',
    weight: 0.24,
    source: 'Rasch & Born 2013；Stickgold & Walker 2013；Wilson & McNaughton 1994',
    gist: '睡眠里海马体把白天的片段重放给皮层，梦是重放时漏出来的东西。',
    bizarreness: [1, 3],
    lucidity: 0.03,
    themes: ['memory'],
    select(frags, rng) {
      const recent = frags.filter((f) => f.ageDays <= 2)
      const old = frags.filter((f) => f.ageDays >= 4)
      const selected = []
      selected.push(...jitterRank(recent.length ? recent : frags, (f) => f.scores.replay, rng).slice(0, 1))
      selected.push(...jitterRank(old.length ? old : frags, (f) => f.scores.replay, rng).slice(0, 2))
      const n = 3 + (rng() < 0.4 ? 1 : 0)
      return fill(selected, frags, n, rng)
    },
  },
  {
    id: 'threat_simulation',
    name: '威胁模拟',
    en: 'threat simulation',
    weight: 0.18,
    source: 'Revonsuo 2000, Behavioral and Brain Sciences',
    gist: '在安全的睡眠里反复排练危险，醒着的时候少被打个措手不及。',
    bizarreness: [2, 4],
    lucidity: 0.04,
    themes: ['threat'],
    select(frags, rng) {
      const ranked = jitterRank(frags, (f) => f.scores.threat + f.scores.unresolved * 0.3, rng)
      const n = 3 + (rng() < 0.5 ? 1 : 0)
      let selected = ranked.slice(0, n)
      if (!selected.some((f) => f.ageDays <= 2)) {
        const recent = ranked.find((f) => f.ageDays <= 2)
        if (recent && selected.length) selected[selected.length - 1] = recent
      }
      return fill(selected, ranked, n, rng)
    },
  },
  {
    id: 'emotion_regulation',
    name: '情绪调节',
    en: 'emotion regulation',
    weight: 0.16,
    source: 'Walker & van der Helm 2009；Cartwright 2010',
    gist: '夜里把没消化的情绪再放一遍，换一个结局，早上就没那么扎人了。',
    bizarreness: [1, 3],
    lucidity: 0.06,
    themes: ['emotion'],
    select(frags, rng) {
      const ranked = jitterRank(
        frags,
        (f) => f.scores.affect + f.scores.unresolved * 0.7 + (f.scores.replay > 1.2 ? 0.3 : 0),
        rng,
      )
      const n = 2 + (rng() < 0.55 ? 1 : 0)
      return fill(ranked.slice(0, n), ranked, n, rng)
    },
  },
  {
    id: 'continuity',
    name: '连续性',
    en: 'continuity hypothesis',
    weight: 0.16,
    source: 'Domhoff 2011；Hall & Van de Castle 1966',
    gist: '梦不是另一个世界，是把醒着时的关切、人和地方接着往下演。',
    bizarreness: [0, 2],
    lucidity: 0.02,
    themes: ['memory', 'social'],
    select(frags, rng) {
      const recent = frags.filter((f) => f.ageDays <= 3)
      const base = recent.length >= 2 ? recent : frags
      const ranked = jitterRank(base, (f) => f.scores.social * 0.8 + f.scores.replay, rng)
      return fill(ranked.slice(0, 3), ranked, 3, rng)
    },
  },
  {
    id: 'predictive_processing',
    name: '预测加工',
    en: 'predictive processing',
    weight: 0.14,
    source: 'Hobson & Friston 2012；Llewellyn 2016',
    gist: '大脑在没有外界输入时继续跑预测，预测误差没人纠正，梦就越来越离谱。',
    bizarreness: [3, 5],
    lucidity: 0.08,
    themes: ['predictive'],
    select(frags, rng) {
      const ranked = jitterRank(frags, (f) => f.scores.prediction + f.scores.unresolved * 0.4, rng)
      const n = 2 + (rng() < 0.5 ? 1 : 0)
      return fill(ranked.slice(0, n), ranked, n, rng)
    },
  },
  {
    id: 'social_simulation',
    name: '社会模拟',
    en: 'social simulation',
    weight: 0.12,
    source: 'Revonsuo, Tuominen & Valli 2015',
    gist: '梦是一个不用付代价的社交排练场：试探边界、练习应对、看别人怎么反应。',
    bizarreness: [1, 3],
    lucidity: 0.05,
    themes: ['social'],
    select(frags, rng) {
      const ranked = jitterRank(frags, (f) => f.scores.social, rng)
      const n = 2 + (rng() < 0.6 ? 1 : 0)
      let selected = ranked.slice(0, n)
      if (!selected.some((f) => f.type === 'heard' || f.type === 'voice')) {
        const heard = ranked.find((f) => f.type === 'heard' || f.type === 'voice')
        if (heard && selected.length) selected[selected.length - 1] = heard
      }
      return fill(selected, ranked, n, rng)
    },
  },
]

export const HYPOTHESIS_IDS = HYPOTHESES.map((h) => h.id)

export function hypothesisById(id) {
  return HYPOTHESES.find((h) => h.id === id) ?? null
}

export function defaultWeights() {
  const out = {}
  for (const h of HYPOTHESES) out[h.id] = h.weight
  return out
}

/** 合并用户权重；未知键丢掉，负数归零，全零回落到默认。 */
export function normalizeWeights(overrides = {}) {
  const out = defaultWeights()
  for (const [k, v] of Object.entries(overrides ?? {})) {
    if (!(k in out)) continue
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0) out[k] = n
  }
  const total = Object.values(out).reduce((a, b) => a + b, 0)
  if (total <= 0) return defaultWeights()
  for (const k of Object.keys(out)) out[k] = out[k] / total
  return out
}

/** 按权重抽一个假说。 */
export function pickHypothesis(rng, weights) {
  const w = weights ?? defaultWeights()
  const items = HYPOTHESES.map((h) => ({ h, weight: w[h.id] ?? h.weight }))
  return pickWeighted(items, rng, (it) => it.weight)?.h ?? HYPOTHESES[0]
}

/**
 * 按假说挑碎片；不够两条就没法做梦，返回 []。
 * @param {object} h
 * @param {object[]} frags
 * @param {() => number} rng
 */
export function pickFragments(h, frags, rng) {
  if (!Array.isArray(frags) || frags.length < 2) return []
  const picked = h.select(frags, rng)
  return uniqueBy(picked, (f) => f.id).slice(0, 5)
}
