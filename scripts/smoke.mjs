/**
 * 冒烟：用真实的 ~/.dsh-fish 事件流做一场梦，只写到临时目录。
 * 用法：node scripts/smoke.mjs [hypothesisId]
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { loadConfig, ensureStore, readFishEvents } from '../lib/store.js'
import { collectFragments } from '../lib/fragments.js'
import { dreamCycle } from '../lib/cycle.js'

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-fish-dream-smoke-'))
const cfg = loadConfig({ dataDir })
ensureStore(cfg)

const events = readFishEvents(cfg)
const frags = collectFragments(events, { now: new Date() })
console.log(`events=${events.length} fragments=${frags.length} fishDir=${cfg.fishDir}`)

const r = dreamCycle(cfg, { force: true, hypothesisId: process.argv[2] })
if (!r.ok) {
  console.log(`没做成：${r.why}`)
  process.exit(1)
}

const d = r.dream
console.log(`night=${d.night} hypothesis=${d.hypothesis} (${d.hypothesisName}) bizarreness=${d.bizarreness} lucid=${d.lucid}`)
console.log('fragments:')
for (const f of d.fragments) console.log(`  ${f.id} [${f.type}] ${f.excerpt}`)
console.log('\n--- seed ---\n')
console.log(d.seedText)
console.log(`\n写入：${path.join(dataDir, 'dreams.jsonl')}`)
