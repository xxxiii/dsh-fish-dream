/**
 * 冒烟：用假 ctx 走一遍插件生命周期（apply → 工具可调 → dispose）。
 * 不装进 profile，也不写 ~/.dsh-fish-dream。
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import * as plugin from '../lib/index.js'

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-fish-dream-apply-'))

const specs = []
let disposed = false
const ctx = {
  tools: { register: (spec) => (specs.push(spec), () => {}) },
  get: (name) => (name === 'agents' ? { list: () => [] } : undefined),
  on: (evt, fn) => (evt === 'dispose' ? (() => (disposed = true)) : () => {}),
}

const handle = await plugin.apply(ctx, { dataDir, auto: false })
console.log(`name=${plugin.name} version=${plugin.version} inject=${JSON.stringify(plugin.inject)}`)
console.log(`tools=${specs.map((s) => s.name).join(', ')}`)

const now = specs.find((s) => s.name === 'dream_now')
const recall = specs.find((s) => s.name === 'dream_recall')
const record = specs.find((s) => s.name === 'dream_record')

const made = await now.execute({ hypothesis: 'continuity' })
console.log(`dream_now ok=${made.ok}`)
const got = await recall.execute({})
console.log(`dream_recall pending=${Boolean(got.pending)}`)
const saved = await record.execute({ text: '我回到那个房间，灯是暖的。' })
console.log(`dream_record ok=${saved.ok}`)

const after = await recall.execute({})
console.log(`after record: pending=${Boolean(after.pending)} recent=${after.recent.length}`)

await handle.dispose()
console.log(`dispose ok, dataDir=${dataDir}`)
