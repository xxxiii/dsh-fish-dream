// 只读诊断：现在这一刻（以及你给的几个时刻）自动路径会不会拼出梦。
import { loadConfig, ensureStore, readFishEvents, readState, pendingDream, allDreams } from '../lib/store.js'
import { collectFragments } from '../lib/fragments.js'
import { dreamChance, lastConversationTs, shouldFormDream, silenceHours } from '../lib/sleep.js'

const cfg = loadConfig({})
ensureStore(cfg)
const events = readFishEvents(cfg)
const now = new Date()
const frags = collectFragments(events, { now })
const state = readState(cfg)
const talkTs = lastConversationTs(events)

console.log('dataDir      ', cfg.dataDir)
console.log('fishDir      ', cfg.fishDir)
console.log('auto         ', cfg.auto, '| 表', JSON.stringify(cfg.dreamTable))
console.log('events       ', events.length, 'fragments', frags.length)
console.log('lastTalk     ', Number.isFinite(talkTs) ? new Date(talkTs).toISOString() : null)
console.log('silenceHours ', silenceHours(now, talkTs).toFixed(2), '| chance', dreamChance(silenceHours(now, talkTs), cfg.dreamTable))
console.log('pending      ', pendingDream(cfg)?.id ?? null)
console.log('lastHibern.  ', state.lastHibernation)
console.log('dreams formed', allDreams(cfg).length)

for (const iso of [process.argv[2], process.argv[3]].filter(Boolean)) {
  const at = new Date(iso)
  const r = shouldFormDream({
    now: at,
    cfg,
    state: { ...state },
    lastConversationTs: talkTs,
    fragmentCount: frags.length,
  })
  console.log(iso, '→', JSON.stringify(r))
}
