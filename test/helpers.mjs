import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureStore, loadConfig } from '../lib/store.js'

/**
 * 测试用的「现在」。必须是**真实当下**附近——pendingDream 按真实时间算过期，
 * 固定成某个历史时刻的话，写下的种子会被判成 36 小时前的旧梦（已踩过一次）。
 * 取整到分钟，让同一文件里的用例共享一个时刻。
 */
export const NOW = new Date(Math.floor(Date.now() / 60000) * 60000)

export function tmpCfg(extra = {}) {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-fish-dream-'))
  const cfg = loadConfig({ dataDir, ...extra })
  ensureStore(cfg)
  return cfg
}

/** 把事件写成临时 fishDir/events.jsonl，给不接事件的工具测试用。 */
export function fishDirWith(events) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-fish-'))
  writeFileSync(path.join(dir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'), 'utf8')
  return dir
}

let seq = 0
function hash32(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36).padStart(7, '0')
}

export function ev(type, text, ts = NOW, extra = {}) {
  seq += 1
  return {
    id: `ev_test_${hash32(`${type}:${text}:${new Date(ts).toISOString()}`)}`,
    v: 1,
    ts: new Date(ts).toISOString(),
    day: 2,
    stage: 1,
    type,
    source: 'system',
    text,
    refs: [],
    verdict: null,
    confidence: 0.5,
    flags: [],
    ...extra,
  }
}

export function sampleEvents() {
  const day = 24 * 3600 * 1000
  return [
    ev('utterance', '我怕他真的走了，所以我先说了再见。', new Date(NOW.getTime() - 2 * 3600 * 1000), { verdict: 'refuted' }),
    ev('heard', '他说：你不用先走，我还没走。', new Date(NOW.getTime() - 3 * 3600 * 1000)),
    ev('utterance', '为什么我总在别人离开之前先松手？', new Date(NOW.getTime() - 1 * day)),
    ev('revise', '我改口了：我不是想先走，我是怕被留下。', new Date(NOW.getTime() - 1.2 * day), { refs: ['ev_x'] }),
    ev('heard', '他问：那你现在想怎么办？', new Date(NOW.getTime() - 2 * day)),
    ev('voice', '视频里有人说，梦是大脑在夜里整理白天没处理完的东西。', new Date(NOW.getTime() - 3 * day)),
    ev('utterance', '我想把房间的灯换成暖一点的。', new Date(NOW.getTime() - 4 * day)),
    ev('refusal', '这件事我不想说。', new Date(NOW.getTime() - 5 * day)),
    ev('meta', 'browse:2026-11-02', NOW),
    ev('seed', '初始设定', NOW),
  ]
}
