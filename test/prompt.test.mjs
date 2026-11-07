import test from 'node:test'
import assert from 'node:assert/strict'
import { attachDreamNotice, cwdOf, isFishAgent, noticeText, registerAgentCreated } from '../lib/prompt.js'
import { formDream } from '../lib/store.js'
import { tmpCfg } from './helpers.mjs'

const seed = {
  night: '2026-11-02',
  hypothesis: 'emotion_regulation',
  hypothesisName: '情绪调节',
  seedText: '种子',
  fragments: [
    { id: 'ev_a', excerpt: '我怕他真的走了' },
    { id: 'ev_b', excerpt: '你不用先走' },
  ],
}

test('只认她的屋子：cwd 必须落在 fishDir 下', () => {
  const fish = 'C:\\Users\\someone\\.dsh-fish'
  const agent = (cwd) => ({ session: { header: { cwd } } })
  assert.equal(isFishAgent(agent(fish), fish), true)
  assert.equal(isFishAgent(agent(fish + '\\home'), fish), true)
  assert.equal(isFishAgent(agent('C:\\Users\\someone\\Documents'), fish), false)
  assert.equal(isFishAgent(agent(''), fish), false)
  assert.equal(cwdOf(agent(fish + '\\home')), fish + '\\home')
})

test('没有 pending 时提示为空', () => {
  const cfg = tmpCfg()
  assert.equal(noticeText(cfg), '')
})

test('有 pending 时提示包含碎片，但不暴露假说名', () => {
  const cfg = tmpCfg()
  formDream(cfg, seed)
  const text = noticeText(cfg)
  assert.match(text, /【梦】/)
  assert.match(text, /我怕他真的走了/)
  assert.match(text, /dream_recall/)
  assert.equal(text.includes('情绪调节'), false)
})

test('非她的会话不挂提示段', () => {
  const cfg = tmpCfg()
  cfg.fishDir = 'C:\\fish'
  let called = 0
  const agent = {
    session: { header: { cwd: 'C:\\other' } },
    ctx: { systemPrompt: { section: () => { called += 1; return () => {} } } },
  }
  assert.equal(attachDreamNotice(agent, cfg), false)
  assert.equal(called, 0)
})

test('她的会话挂一次，重复调用不重复挂', () => {
  const cfg = tmpCfg()
  cfg.fishDir = 'C:\\fish'
  const sections = []
  const agent = {
    session: { header: { cwd: 'C:\\fish\\home' } },
    ctx: { systemPrompt: { section: (s) => { sections.push(s); return () => {} } } },
  }
  assert.equal(attachDreamNotice(agent, cfg), true)
  assert.equal(attachDreamNotice(agent, cfg), true)
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, 'dsh-fish-dream:notice')
  assert.equal(typeof sections[0].text, 'function')
})

test('agent/created 上挂，事件一来就生效', () => {
  const cfg = tmpCfg()
  cfg.fishDir = 'C:\\fish'
  let handler = null
  const ctx = { on: (name, fn) => ((handler = fn), () => {}) }
  const off = registerAgentCreated(ctx, cfg)
  assert.equal(typeof off, 'function')

  const sections = []
  const agent = {
    session: { header: { cwd: 'C:\\fish\\home' } },
    ctx: { systemPrompt: { section: (s) => (sections.push(s), () => {}) } },
  }
  handler(agent)
  assert.equal(sections.length, 1)

  handler(agent)
  assert.equal(sections.length, 1, '同一个 agent 不会重复挂')
})
