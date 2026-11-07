import test from 'node:test'
import assert from 'node:assert/strict'
import { dreamCycle } from '../lib/cycle.js'
import { pendingDream, recentDreams, recordDream, readState } from '../lib/store.js'
import { localDateKey } from '../lib/util.js'
import { NOW, sampleEvents, tmpCfg } from './helpers.mjs'

const H = 3600e3
/** 让「最后一句对话」正好发生在 hours 小时前。 */
const talkedAgo = (hours) => {
  const base = NOW.getTime() - hours * H
  return sampleEvents().map((e, i) => ({ ...e, ts: new Date(base - i * 30000).toISOString() }))
}
const cfg = () => tmpCfg({ minFragments: 3 })

test('不到 2 小时不做梦', () => {
  const r = dreamCycle(cfg(), { now: NOW, events: talkedAgo(1) })
  assert.equal(r.ok, false)
  assert.equal(r.why, 'awake')
})

test('掷中就拼一场，并记下沉默起点', () => {
  const c = cfg()
  const events = talkedAgo(3)
  const r = dreamCycle(c, { now: NOW, events, rng: () => 0 })
  assert.equal(r.ok, true)
  assert.equal(r.dream.night, localDateKey(NOW))
  assert.equal(r.dream.status, 'pending')
  assert.ok(Math.abs(r.dream.sleepHours - 3) < 0.01)
  assert.ok(r.dream.seedText.includes('梦的种子'))
  assert.ok(pendingDream(c))
  assert.equal(readState(c).lastHibernation, events.reduce((a, e) => (Date.parse(e.ts) > Date.parse(a) ? e.ts : a), events[0].ts))
})

test('掷不中：rolled out，带这一档的概率', () => {
  const r = dreamCycle(cfg(), { now: NOW, events: talkedAgo(3), rng: () => 0.99 })
  assert.equal(r.ok, false)
  assert.equal(r.why, 'rolled out')
  assert.equal(r.chance, 0.05)
})

test('同一段沉默只做一场', () => {
  const c = cfg()
  const events = talkedAgo(8)
  const first = dreamCycle(c, { now: NOW, events, rng: () => 0 })
  assert.equal(first.ok, true)
  recordDream(c, { text: '我在水边站着，水面比平时高。', refs: first.dream.fragments.map((f) => f.id) })
  const again = dreamCycle(c, { now: NOW, events, rng: () => 0 })
  assert.equal(again.ok, false)
  assert.equal(again.why, 'already dreamed this sleep')
})

test('force 可指定假说', () => {
  const r = dreamCycle(cfg(), { force: true, now: NOW, events: talkedAgo(3), hypothesisId: 'social_simulation' })
  assert.equal(r.ok, true)
  assert.equal(r.dream.hypothesis, 'social_simulation')
})

test('碎片太少时不做', () => {
  const events = talkedAgo(8).filter((e) => e.type === 'utterance').slice(0, 1)
  const r = dreamCycle(cfg(), { now: NOW, events })
  assert.equal(r.ok, false)
  assert.match(r.why, /fragments/)
})

test('做梦 → 记录 → 最近列表闭环', () => {
  const c = cfg()
  const r = dreamCycle(c, { now: NOW, events: talkedAgo(8), rng: () => 0, hypothesisId: 'continuity' })
  const rec = recordDream(c, { text: '我回到自己的房间，灯还亮着。', refs: r.dream.fragments.map((f) => f.id) })
  assert.equal(rec.ok, true)
  const recent = recentDreams(c, 3)
  assert.equal(recent.length, 1)
  assert.equal(recent[0].hypothesis, 'continuity')
})
