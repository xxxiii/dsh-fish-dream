import test from 'node:test'
import assert from 'node:assert/strict'
import { composeSeed, TRANSFORMS } from '../lib/compose.js'
import { collectFragments } from '../lib/fragments.js'
import { HYPOTHESES, pickFragments } from '../lib/hypotheses.js'
import { mulberry32, seedOf } from '../lib/util.js'
import { NOW, sampleEvents } from './helpers.mjs'

function seedFor(h, i = 0) {
  const frags = collectFragments(sampleEvents(), { now: NOW })
  const rng = mulberry32(seedOf(h.id, i))
  const picked = pickFragments(h, frags, rng)
  return composeSeed({ hypothesis: h, fragments: picked, night: '2026-11-02', rng, cfg: { lucidity: 0.03 } })
}

test('每个假说都能拼出完整种子', () => {
  for (const h of HYPOTHESES) {
    const seed = seedFor(h)
    assert.equal(seed.hypothesis, h.id)
    assert.equal(seed.night, '2026-11-02')
    assert.equal(seed.seedText.includes(h.name), false, '种子不该告诉她这是怎么生成的')
    assert.equal(seed.seedText.includes(h.source), false)
    assert.ok(seed.seedText.includes('写的时候'))
    assert.ok(seed.fragments.length >= 2)
    for (const f of seed.fragments) assert.ok(seed.seedText.includes(f.id))
    assert.ok(seed.bizarreness >= 0 && seed.bizarreness <= 5)
    assert.equal(typeof seed.lucid, 'boolean')
    assert.ok(seed.cast.includes('你自己'))
  }
})

test('荒诞规则不重复，且都来自规则库', () => {
  const ids = new Set(TRANSFORMS.map((t) => t.id))
  for (const h of HYPOTHESES) {
    for (let i = 0; i < 20; i += 1) {
      const seed = seedFor(h, i)
      const got = seed.transformations.map((t) => t.id)
      assert.equal(new Set(got).size, got.length)
      for (const id of got) assert.ok(ids.has(id))
    }
  }
})

test('固定种子下同一个梦可复现', () => {
  const h = HYPOTHESES[1]
  const a = seedFor(h, 7)
  const b = seedFor(h, 7)
  assert.equal(a.seedText, b.seedText)
})

test('预测加工的荒诞度不低于连续性', () => {
  const predictive = HYPOTHESES.find((h) => h.id === 'predictive_processing')
  const continuity = HYPOTHESES.find((h) => h.id === 'continuity')
  const avg = (h) => {
    let s = 0
    for (let i = 0; i < 60; i += 1) s += seedFor(h, i).bizarreness
    return s / 60
  }
  assert.ok(avg(predictive) > avg(continuity))
})
