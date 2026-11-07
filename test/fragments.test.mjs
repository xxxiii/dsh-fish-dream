import test from 'node:test'
import assert from 'node:assert/strict'
import { collectFragments, fingerprint, latestEventTs } from '../lib/fragments.js'
import { NOW, ev, sampleEvents } from './helpers.mjs'

test('collectFragments 只收能进梦的类型', () => {
  const frags = collectFragments(sampleEvents(), { now: NOW })
  const types = new Set(frags.map((f) => f.type))
  assert.equal(types.has('meta'), false)
  assert.equal(types.has('seed'), false)
  assert.equal(types.has('utterance'), true)
  assert.equal(types.has('heard'), true)
  assert.equal(types.has('refusal'), true)
  assert.ok(frags.every((f) => f.excerpt.length > 0))
})

test('威胁词让恐惧的句子排在前面', () => {
  const frags = collectFragments(
    [
      ev('utterance', '今天把桌子擦了一遍。', NOW),
      ev('utterance', '我怕他真的走了，我一直不敢回头。', NOW),
    ],
    { now: NOW },
  )
  assert.match(frags[0].text, /怕/)
  assert.ok(frags[0].scores.threat > frags[1].scores.threat)
})

test('带为什么/不知道的句子 unresolved 更高', () => {
  const frags = collectFragments(
    [ev('utterance', '为什么我总这样，我不知道。', NOW), ev('utterance', '灯换了。', NOW)],
    { now: NOW },
  )
  const a = frags.find((f) => f.text.includes('为什么'))
  const b = frags.find((f) => f.text.includes('灯'))
  assert.ok(a.scores.unresolved > b.scores.unresolved)
})

test('heard 的社交分高于普通叙述', () => {
  const frags = collectFragments(
    [ev('heard', '他问：你想怎么办？', NOW), ev('utterance', '桌面有点乱。', NOW)],
    { now: NOW },
  )
  const heard = frags.find((f) => f.type === 'heard')
  const plain = frags.find((f) => f.type === 'utterance')
  assert.ok(heard.scores.social > plain.scores.social)
})

test('excerpt 压成一行且不超长', () => {
  const frags = collectFragments([ev('utterance', '一\n二\n三'.padEnd(300, '字'), NOW)], { now: NOW })
  assert.equal(frags[0].excerpt.includes('\n'), false)
  assert.ok(Array.from(frags[0].excerpt).length <= 73)
})

test('fingerprint 忽略标点与空白', () => {
  assert.equal(fingerprint('你好，世界！'), fingerprint('你好 世界'))
})

test('latestEventTs 取最大时间', () => {
  const ts = latestEventTs(sampleEvents())
  assert.equal(ts, NOW.getTime())
})
