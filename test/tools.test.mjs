import test from 'node:test'
import assert from 'node:assert/strict'
import { dreamCycle } from '../lib/cycle.js'
import { registerDreamTools } from '../lib/tools.js'
import { NOW, fishDirWith, sampleEvents, tmpCfg } from './helpers.mjs'

const EVENTS = sampleEvents()

function cfgWithEvents(extra = {}) {
  const cfg = tmpCfg(extra)
  cfg.fishDir = fishDirWith(EVENTS)
  return cfg
}

function fakeCtx() {
  const specs = []
  return {
    specs,
    tools: {
      register(spec) {
        specs.push(spec)
        return () => {}
      },
    },
  }
}

function byName(ctx, name) {
  return ctx.specs.find((s) => s.name === name)
}

test('注册三个工具且参数是标准 JSON Schema', () => {
  const ctx = fakeCtx()
  registerDreamTools(ctx, cfgWithEvents())
  assert.deepEqual(ctx.specs.map((s) => s.name).sort(), ['dream_now', 'dream_recall', 'dream_record'])
  for (const s of ctx.specs) {
    assert.equal(s.parameters.type, 'object')
    assert.equal(s.output.schema.type, 'object')
    assert.equal(typeof s.execute, 'function')
  }
})

test('没有梦时 dream_recall 返回最近记录', async () => {
  const ctx = fakeCtx()
  registerDreamTools(ctx, cfgWithEvents())
  const recall = byName(ctx, 'dream_recall')
  const out = await recall.execute({})
  assert.equal(out.ok, true)
  assert.equal(out.pending, null)
  assert.deepEqual(out.recent, [])
  assert.match(recall.output.render({}, out)[0].text, /还没有/)
})

test('做一个梦后 recall 返回种子，record 落库', async () => {
  const ctx = fakeCtx()
  registerDreamTools(ctx, cfgWithEvents())
  const made = await byName(ctx, 'dream_now').execute({ hypothesis: 'threat_simulation' })
  assert.equal(made.ok, true)

  const recall = byName(ctx, 'dream_recall')
  const got = await recall.execute({})
  assert.ok(got.pending?.seed?.includes('写的时候'))
  assert.match(recall.output.render({}, got)[0].text, /dream_record/)

  const record = byName(ctx, 'dream_record')
  const saved = await record.execute({ text: '我在巷子里跑，后面有脚步。' })
  assert.equal(saved.ok, true)
  assert.equal(record.output.render({}, saved)[0].text, '[记下了]')

  const after = await recall.execute({})
  assert.equal(after.pending, null)
  assert.equal(after.recent.length, 1)
  const recentText = recall.output.render({}, after)[0].text
  assert.match(recentText, /2026-/)
  assert.equal(recentText.includes('威胁模拟'), false, '最近列表不该带生成方式')
  assert.equal(recentText.includes('threat_simulation'), false)
})

test('dream_record 失败时回执说清原因', async () => {
  const ctx = fakeCtx()
  registerDreamTools(ctx, cfgWithEvents())
  const record = byName(ctx, 'dream_record')
  const out = await record.execute({ text: '没有种子的梦。' })
  assert.equal(out.ok, false)
  assert.match(record.output.render({}, out)[0].text, /没记下/)
})

test('dream_now 在白天也能做', async () => {
  const ctx = fakeCtx()
  registerDreamTools(ctx, cfgWithEvents())
  const out = await byName(ctx, 'dream_now').execute({})
  assert.equal(out.ok, true)
  assert.ok(out.dream.seedText.length > 50)
})

test('force 做出来的 pending 梦能被 recall 读到', async () => {
  const cfg = cfgWithEvents()
  dreamCycle(cfg, { now: NOW, events: EVENTS, force: true })
  const ctx = fakeCtx()
  registerDreamTools(ctx, cfg)
  const got = await byName(ctx, 'dream_recall').execute({})
  assert.ok(got.pending)
})
