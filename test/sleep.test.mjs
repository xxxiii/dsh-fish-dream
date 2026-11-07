import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_TABLE,
  dreamChance,
  lastConversationTs,
  normalizeTable,
  shouldFormDream,
  silenceHours,
} from '../lib/sleep.js'

const NOW = new Date('2026-11-03T10:00:00+08:00')
const H = 3600e3
const at = (hoursAgo) => new Date(NOW.getTime() - hoursAgo * H).toISOString()
const ev = (type, hoursAgo) => ({ id: `ev_${type}_${hoursAgo}`, type, ts: at(hoursAgo) })

test('lastConversationTs 只认对话类事件', () => {
  const events = [ev('meta', 1), ev('diary', 2), ev('dream', 3), ev('heard', 7), ev('utterance', 5), ev('voice', 9)]
  assert.equal(lastConversationTs(events), Date.parse(at(5)))
  assert.equal(lastConversationTs([ev('meta', 1)]), null)
  assert.equal(lastConversationTs([]), null)
})

test('silenceHours：没有对话就是 Infinity', () => {
  assert.equal(silenceHours(NOW, null), Infinity)
  assert.equal(silenceHours(NOW, Date.parse(at(6))), 6)
  assert.equal(silenceHours(NOW, Date.parse(at(-1))), 0)
})

test('dreamChance 按表取整段的值', () => {
  assert.equal(dreamChance(0, DEFAULT_TABLE), 0)
  assert.equal(dreamChance(1.9, DEFAULT_TABLE), 0)
  assert.equal(dreamChance(2, DEFAULT_TABLE), 0.05)
  assert.equal(dreamChance(3.9, DEFAULT_TABLE), 0.05)
  assert.equal(dreamChance(4, DEFAULT_TABLE), 0.15)
  assert.equal(dreamChance(6, DEFAULT_TABLE), 0.3)
  assert.equal(dreamChance(8, DEFAULT_TABLE), 0.5)
  assert.equal(dreamChance(12, DEFAULT_TABLE), 0.65)
  assert.equal(dreamChance(18, DEFAULT_TABLE), 0.75)
  assert.equal(dreamChance(24, DEFAULT_TABLE), 0.85)
  assert.equal(dreamChance(48, DEFAULT_TABLE), 0.9)
  assert.equal(dreamChance(999, DEFAULT_TABLE), 0.9)
})

test('normalizeTable：支持 "inf"、去掉坏值、排序、末尾补无限', () => {
  const t = normalizeTable([[24, 0.7], ['x', 1], [2, 0], [12, 2], ['inf', 0.9]])
  assert.deepEqual(t, [[2, 0], [12, 1], [24, 0.7], [Infinity, 0.9]])
  assert.deepEqual(normalizeTable('nope'), DEFAULT_TABLE)
})

test('dreamChance 吃配置里写回来的 "inf"', () => {
  const t = normalizeTable([[2, 0], ['inf', 0.5]])
  assert.equal(dreamChance(100, t), 0.5)
})

const base = () => ({
  now: NOW,
  cfg: { auto: true, minFragments: 3, staleDays: 5, dreamTable: DEFAULT_TABLE },
  state: {},
  lastConversationTs: Date.parse(at(3)),
  fragmentCount: 10,
})

test('shouldFormDream：不到 2 小时不做', () => {
  const r = shouldFormDream({ ...base(), lastConversationTs: Date.parse(at(1)) })
  assert.equal(r.ok, false)
  assert.equal(r.why, 'awake')
  assert.equal(r.chance, 0)
})

test('shouldFormDream：过门时给这一档的概率', () => {
  const r = shouldFormDream(base())
  assert.equal(r.ok, true)
  assert.equal(r.chance, 0.05)
  assert.equal(r.hibernationStart, at(3))
  assert.equal(r.night, '2026-11-03')
})

test('shouldFormDream：同一段沉默只做一场', () => {
  const r = shouldFormDream({ ...base(), state: { lastHibernation: at(3) } })
  assert.equal(r.ok, false)
  assert.equal(r.why, 'already dreamed this sleep')
})

test('shouldFormDream：其余几种挡法', () => {
  assert.equal(shouldFormDream({ ...base(), cfg: { ...base().cfg, auto: false } }).why, 'auto off')
  assert.equal(shouldFormDream({ ...base(), state: { pendingId: 'dr_x' } }).why, 'pending')
  assert.equal(shouldFormDream({ ...base(), fragmentCount: 1 }).why, 'not enough fragments')
  assert.equal(shouldFormDream({ ...base(), lastConversationTs: Date.parse(at(6 * 24)) }).why, 'nothing recent to dream about')
})
