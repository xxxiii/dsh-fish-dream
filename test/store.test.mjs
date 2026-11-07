import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  allDreams,
  dreamById,
  ensureStore,
  formDream,
  pendingDream,
  readState,
  recentDreams,
  recordDream,
} from '../lib/store.js'
import { tmpCfg } from './helpers.mjs'

const seed = {
  night: '2026-11-02',
  hypothesis: 'threat_simulation',
  hypothesisName: '威胁模拟',
  seedText: '种子',
  fragments: [
    { id: 'ev_a', type: 'utterance', excerpt: '一' },
    { id: 'ev_b', type: 'heard', excerpt: '二' },
  ],
}

test('formDream 落库并成为 pending', () => {
  const cfg = tmpCfg()
  const d = formDream(cfg, seed)
  assert.equal(d.status, 'pending')
  assert.ok(d.id.startsWith('dr_'))
  assert.equal(pendingDream(cfg).id, d.id)
  assert.equal(readState(cfg).lastFormedNight, '2026-11-02')
  assert.equal(allDreams(cfg).length, 1)
})

test('recordDream 写下梦文、更新最近列表与梦页', () => {
  const cfg = tmpCfg()
  const d = formDream(cfg, seed)
  const r = recordDream(cfg, { text: '我在一条没有灯的巷子里跑。', refs: ['ev_a'] })
  assert.equal(r.ok, true)
  assert.equal(r.night, '2026-11-02')
  assert.equal(pendingDream(cfg), null)

  const recent = recentDreams(cfg, 5)
  assert.equal(recent.length, 1)
  assert.match(recent[0].text, /巷子/)

  const md = fs.readFileSync(path.join(cfg.dataDir, 'dreams', '2026-11-02.md'), 'utf8')
  assert.equal(md.includes('威胁模拟'), false, '梦页不该带生成方式')
  assert.match(md, /巷子/)
  assert.match(md, /ev_a/)
  assert.ok(md.includes(d.night))

  // dreams.jsonl 里那条不能还写着 pending
  assert.equal(dreamById(cfg, d.id).status, 'recorded')
})

test('没有 pending 时 recordDream 拒绝', () => {
  const cfg = tmpCfg()
  const r = recordDream(cfg, { text: '一个梦' })
  assert.equal(r.ok, false)
  assert.match(r.note, /没有/)
})

test('超长与空文本被拒绝，且 pending 保留', () => {
  const cfg = tmpCfg({ maxChars: 100 })
  formDream(cfg, seed)
  assert.equal(recordDream(cfg, { text: '' }).ok, false)
  assert.equal(recordDream(cfg, { text: '字'.repeat(101) }).ok, false)
  assert.ok(pendingDream(cfg))
})

test('refs 必须是种子里的碎片', () => {
  const cfg = tmpCfg()
  formDream(cfg, seed)
  const bad = recordDream(cfg, { text: '只有不存在的引用。', refs: ['ev_nope'] })
  assert.equal(bad.ok, false)
  assert.ok(pendingDream(cfg))

  const ok = recordDream(cfg, { text: '重拼一次。', refs: ['ev_b', 'ev_nope'] })
  assert.equal(ok.ok, true)
})

test('pending 过期后作废，不堵住下一夜', () => {
  const cfg = tmpCfg({ pendingHours: 1 })
  const old = new Date(Date.now() - 3 * 3600 * 1000)
  formDream(cfg, seed, old)
  assert.equal(pendingDream(cfg), null)
  assert.equal(readState(cfg).pendingId, null)
})

test('state 写坏了不会炸，回落到空状态', () => {
  const cfg = tmpCfg()
  fs.writeFileSync(path.join(cfg.dataDir, 'state.json'), '{broken', 'utf8')
  const s = readState(cfg)
  assert.equal(s.pendingId, null)
})

test('首次运行写一份默认 config.json，之后不覆盖', () => {
  const cfg = tmpCfg()
  const file = path.join(cfg.dataDir, 'config.json')
  const first = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(first.auto, true)
  assert.deepEqual(first.dreamTable[0], [2, 0])
  assert.equal(first.dreamTable.at(-1)[0], 'inf')
  assert.equal(first.dreamTable.at(-1)[1], 0.9)
  assert.equal('dataDir' in first, false)
  assert.equal('fishDir' in first, false)

  fs.writeFileSync(file, JSON.stringify({ auto: false }), 'utf8')
  ensureStore(cfg)
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).auto, false)
})
