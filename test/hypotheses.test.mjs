import test from 'node:test'
import assert from 'node:assert/strict'
import { collectFragments } from '../lib/fragments.js'
import {
  HYPOTHESES,
  HYPOTHESIS_IDS,
  defaultWeights,
  normalizeWeights,
  pickFragments,
  pickHypothesis,
} from '../lib/hypotheses.js'
import { mulberry32, seedOf } from '../lib/util.js'
import { NOW, sampleEvents } from './helpers.mjs'

test('六个假说的权重和为 1', () => {
  const w = defaultWeights()
  assert.equal(Object.keys(w).length, 6)
  const sum = Object.values(w).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum - 1) < 1e-9)
})

test('normalizeWeights 丢掉未知键、接受零、全零回落', () => {
  const w = normalizeWeights({ nope: 5, threat_simulation: 0 })
  assert.equal('nope' in w, false)
  assert.equal(w.threat_simulation, 0)
  const all = normalizeWeights(Object.fromEntries(HYPOTHESIS_IDS.map((id) => [id, 0])))
  assert.ok(Object.values(all).some((v) => v > 0))
})

test('pickHypothesis 只会返回六个之一，且固定种子可复现', () => {
  const a = pickHypothesis(mulberry32(seedOf('x')), defaultWeights())
  const b = pickHypothesis(mulberry32(seedOf('x')), defaultWeights())
  assert.equal(a.id, b.id)
  assert.ok(HYPOTHESIS_IDS.includes(a.id))
})

test('每个假说都能选出 2–5 条不重复碎片', () => {
  const frags = collectFragments(sampleEvents(), { now: NOW })
  for (const h of HYPOTHESES) {
    const picked = pickFragments(h, frags, mulberry32(seedOf(h.id)))
    assert.ok(picked.length >= 2, h.id)
    assert.ok(picked.length <= 5, h.id)
    assert.equal(new Set(picked.map((f) => f.id)).size, picked.length, h.id)
  }
})

test('威胁模拟至少带一条最近的碎片', () => {
  const frags = collectFragments(sampleEvents(), { now: NOW })
  const h = HYPOTHESES.find((x) => x.id === 'threat_simulation')
  for (let i = 0; i < 12; i += 1) {
    const picked = pickFragments(h, frags, mulberry32(seedOf('t', i)))
    assert.ok(picked.some((f) => f.ageDays <= 2), `轮次 ${i}`)
  }
})

test('连续性优先取最近的碎片', () => {
  const frags = collectFragments(sampleEvents(), { now: NOW })
  const h = HYPOTHESES.find((x) => x.id === 'continuity')
  const picked = pickFragments(h, frags, mulberry32(seedOf('c')))
  assert.ok(picked.some((f) => f.ageDays <= 3))
})

test('碎片不足两条时返回空', () => {
  const h = HYPOTHESES[0]
  assert.deepEqual(pickFragments(h, [], Math.random), [])
  assert.deepEqual(pickFragments(h, [{ id: 'a' }], Math.random), [])
})
