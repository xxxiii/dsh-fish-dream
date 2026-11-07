/**
 * store.js —— 插件自己的库：种子、记录、状态、可读的梦页。
 *
 * 边界：
 *   - ~/.dsh-fish 只读。这里所有写操作都落在 ~/.dsh-fish-dream（或 DSH_FISH_DREAM_HOME）。
 *   - dreams.jsonl 只追加：一条种子写下就不再改。
 *   - records.jsonl 只追加：梦文写一次，之后只有她主动改口才需要新记录。
 *   - state.json 是派生的指针，可以随时由两份 jsonl 重建。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultWeights, normalizeWeights } from './hypotheses.js'
import { DEFAULT_TABLE, normalizeTable } from './sleep.js'
import { hhmm, normText, randId } from './util.js'

export const DEFAULTS = {
  auto: true,
  fishDir: '',
  dataDir: '',
  // 距离最后一次对话多久 → 这一次检查掷中的概率
  dreamTable: DEFAULT_TABLE.map(([h, p]) => [h, p]),
  minFragments: 3,
  maxChars: 400,
  pendingHours: 36,
  staleDays: 5,
  tickMinutes: 15,
  lucidity: 0.03,
  prompt: true,
  promptOrder: 8550,
  weights: defaultWeights(),
}

function expand(p) {
  const s = String(p ?? '').trim()
  if (!s) return ''
  if (s === '~') return os.homedir()
  if (s.startsWith('~/') || s.startsWith('~\\')) return path.join(os.homedir(), s.slice(2))
  return path.resolve(s)
}

export function loadConfig(overrides = {}) {
  const dataDir =
    expand(overrides?.dataDir) ||
    expand(process.env.DSH_FISH_DREAM_HOME) ||
    expand(process.env.DSH_DREAM_HOME) ||
    path.join(os.homedir(), '.dsh-fish-dream')
  let fileCfg = {}
  try {
    fileCfg = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'))
  } catch {
    fileCfg = {}
  }
  const cfg = { ...DEFAULTS, ...fileCfg, ...(overrides ?? {}) }
  cfg.dataDir = dataDir
  cfg.fishDir = expand(cfg.fishDir) || expand(process.env.DSH_FISH_HOME) || path.join(os.homedir(), '.dsh-fish')
  cfg.dreamTable = normalizeTable(cfg.dreamTable, DEFAULT_TABLE)
  cfg.weights = normalizeWeights({ ...DEFAULTS.weights, ...(fileCfg.weights ?? {}), ...(overrides?.weights ?? {}) })
  cfg.maxChars = Math.max(100, Math.min(1200, Number(cfg.maxChars) || DEFAULTS.maxChars))
  cfg.tickMinutes = Math.max(1, Math.min(240, Number(cfg.tickMinutes) || DEFAULTS.tickMinutes))
  cfg.pendingHours = Math.max(1, Number(cfg.pendingHours) || DEFAULTS.pendingHours)
  return cfg
}

export function ensureStore(cfg) {
  fs.mkdirSync(cfg.dataDir, { recursive: true })
  fs.mkdirSync(path.join(cfg.dataDir, 'dreams'), { recursive: true })
  fs.mkdirSync(path.join(cfg.dataDir, 'logs'), { recursive: true })
  // 首次运行落一份默认配置：默认值本来就在代码里，但「能看见、能改」比「知道它在哪」有用。
  const cfgFile = path.join(cfg.dataDir, 'config.json')
  if (!fs.existsSync(cfgFile)) {
    const seed = {}
    for (const [k, v] of Object.entries(DEFAULTS)) {
      if (k === 'fishDir' || k === 'dataDir') continue
      // JSON 没有 Infinity，写成人能看懂的 "inf"；读回来由 normalizeTable 认。
      seed[k] = k === 'dreamTable' ? v.map(([h, p]) => [Number.isFinite(h) ? h : 'inf', p]) : v
    }
    try {
      fs.writeFileSync(cfgFile, JSON.stringify(seed, null, 2) + '\n', 'utf8')
    } catch {
      /* 目录只读就算了，代码里的默认值照用 */
    }
  }
}

export function paths(cfg) {
  return {
    dreams: path.join(cfg.dataDir, 'dreams.jsonl'),
    records: path.join(cfg.dataDir, 'records.jsonl'),
    state: path.join(cfg.dataDir, 'state.json'),
    dir: cfg.dataDir,
    fishEvents: path.join(cfg.fishDir, 'events.jsonl'),
  }
}

function readJsonl(file) {
  let raw = ''
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const out = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      /* 坏行跳过，后面的还能读 */
    }
  }
  return out
}

function appendJsonl(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8')
}

export function readState(cfg) {
  try {
    const s = JSON.parse(fs.readFileSync(paths(cfg).state, 'utf8'))
    return {
      version: 1,
      pendingId: null,
      lastHibernation: null,
      lastFormedNight: null,
      lastFormedAt: null,
      lastRecordedNight: null,
      formed: 0,
      recorded: 0,
      faded: 0,
      ...s,
    }
  } catch {
    return { version: 1, pendingId: null, lastHibernation: null, lastFormedNight: null, lastFormedAt: null, lastRecordedNight: null, formed: 0, recorded: 0, faded: 0 }
  }
}

export function writeState(cfg, state) {
  const p = paths(cfg).state
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ ...state, version: 1 }, null, 2), 'utf8')
  fs.renameSync(tmp, p)
}

export function readFishEvents(cfg) {
  return readJsonl(paths(cfg).fishEvents)
}

/** 把那条梦的 status 改掉（recorded / faded）。行数很少，整份重写。 */
function markDreamStatus(cfg, dreamId, status) {
  const p = paths(cfg).dreams
  const all = allDreams(cfg)
  if (!all.some((d) => d.id === dreamId)) return
  const tmp = p + '.tmp'
  fs.writeFileSync(
    tmp,
    all.map((d) => JSON.stringify(d.id === dreamId ? { ...d, status } : d)).join('\n') + '\n',
    'utf8',
  )
  fs.renameSync(tmp, p)
}

export function allDreams(cfg) {
  return readJsonl(paths(cfg).dreams).sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
}

export function allRecords(cfg) {
  return readJsonl(paths(cfg).records)
}

export function dreamById(cfg, id) {
  return allDreams(cfg).find((d) => d.id === id) ?? null
}

export function pendingDream(cfg) {
  const state = readState(cfg)
  if (!state.pendingId) return null
  const dream = dreamById(cfg, state.pendingId)
  if (!dream) {
    writeState(cfg, { ...state, pendingId: null })
    return null
  }
  const ageH = Date.now() - Date.parse(dream.ts)
  if (Number.isFinite(ageH) && ageH > cfg.pendingHours * 3600000) {
    writeState(cfg, { ...state, pendingId: null, faded: (state.faded ?? 0) + 1 })
    try {
      markDreamStatus(cfg, dream.id, 'faded')
    } catch {
      /* 状态改不动也不算事 */
    }
    return null
  }
  return dream
}

/** 写下一条种子。返回完整 dream 对象。 */
export function formDream(cfg, seed, now = new Date()) {
  const dream = {
    id: randId('dr_'),
    v: 1,
    ts: now.toISOString(),
    status: 'pending',
    ...seed,
  }
  appendJsonl(paths(cfg).dreams, dream)
  const state = readState(cfg)
  writeState(cfg, {
    ...state,
    pendingId: dream.id,
    lastHibernation: dream.hibernation ?? state.lastHibernation ?? null,
    lastFormedNight: dream.night,
    lastFormedAt: dream.ts,
    formed: (state.formed ?? 0) + 1,
  })
  return dream
}

/**
 * 把 pending 的梦记下来。
 * @returns {{ ok: boolean, id?: string, night?: string, note: string }}
 */
export function recordDream(cfg, { text, refs, sessionId } = {}, now = new Date()) {
  const dream = pendingDream(cfg)
  if (!dream) return { ok: false, note: '没有等着记的梦。' }

  const body = normText(text)
  if (body.length < 2) return { ok: false, note: '太短了，什么都没留下。' }
  if (body.length > cfg.maxChars) return { ok: false, note: `超过 ${cfg.maxChars} 字了。` }

  const allowed = new Set((dream.fragments ?? []).map((f) => String(f.id)))
  let chosen = Array.isArray(refs) && refs.length ? refs.map(String) : [...allowed]
  chosen = [...new Set(chosen)].filter((r) => allowed.has(r)).slice(0, 6)
  if (!chosen.length) return { ok: false, note: '这条梦找不到它拼自的碎片。' }

  const record = {
    dreamId: dream.id,
    ts: now.toISOString(),
    text: body,
    refs: chosen,
    sessionId: sessionId ?? null,
  }
  appendJsonl(paths(cfg).records, record)
  try {
    markDreamStatus(cfg, dream.id, 'recorded')
  } catch {
    /* 状态改不动也不算事 */
  }

  const state = readState(cfg)
  writeState(cfg, {
    ...state,
    pendingId: null,
    lastRecordedNight: dream.night,
    recorded: (state.recorded ?? 0) + 1,
  })

  writeMarkdown(cfg, dream, record)
  return { ok: true, id: dream.id, night: dream.night, note: '记下了。' }
}

export function writeMarkdown(cfg, dream, record) {
  const file = path.join(cfg.dataDir, 'dreams', `${dream.night}.md`)
  let head = ''
  try {
    if (!fs.existsSync(file)) head = `# 梦 · ${dream.night}\n\n`
  } catch {
    head = `# 梦 · ${dream.night}\n\n`
  }
  const frag = (record.refs ?? []).map((r) => `\`${r}\``).join(' ')
  const block =
    `## ${hhmm(new Date(record.ts))}\n\n` +
    `${record.text}\n\n` +
    (frag ? `碎片：${frag}\n\n` : '')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, head + block, 'utf8')
}

/** 最近记下来的梦，按梦文时间倒序。 */
export function recentDreams(cfg, limit = 5) {
  const dreams = new Map(allDreams(cfg).map((d) => [d.id, d]))
  return allRecords(cfg)
    .filter((r) => dreams.has(r.dreamId))
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
    .slice(0, Math.max(1, limit))
    .map((r) => {
      const d = dreams.get(r.dreamId)
      return {
        id: d.id,
        night: d.night,
        hypothesis: d.hypothesis,
        hypothesisName: d.hypothesisName,
        ts: r.ts,
        text: r.text,
        refs: r.refs ?? [],
      }
    })
}

export function logLine(cfg, message, extra) {
  try {
    const line = `[${new Date().toISOString()}] ${message}${extra ? ' ' + JSON.stringify(extra) : ''}\n`
    fs.appendFileSync(path.join(cfg.dataDir, 'logs', 'dream.log'), line, 'utf8')
  } catch {
    /* 日志写不了就算了 */
  }
}
