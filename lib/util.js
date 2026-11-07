/**
 * util.js —— 无依赖的小工具：随机数、取样、文本处理。
 *
 * 为什么自己写 mulberry32：
 *   梦的生成必须可复现——测试里给一个固定种子，同一条事件流、同一个夜晚，
 *   应当拼出同一个梦。Math.random() 做不到这一点，而引第三方 rng 又没必要。
 */

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

/** 32 位种子随机数；返回 [0,1) 的函数。 */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 把任意字符串 / 数字揉成一个 32 位种子。 */
export function seedOf(...parts) {
  const s = parts.map((p) => String(p ?? '')).join('\u0001')
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function pick(arr, rng) {
  if (!Array.isArray(arr) || arr.length === 0) return undefined
  return arr[Math.floor(rng() * arr.length)]
}

export function pickWeighted(items, rng, weightOf = (x) => x.weight ?? 1) {
  const total = items.reduce((sum, it) => sum + Math.max(0, weightOf(it)), 0)
  if (total <= 0) return undefined
  let r = rng() * total
  for (const it of items) {
    r -= Math.max(0, weightOf(it))
    if (r < 0) return it
  }
  return items[items.length - 1]
}

export function shuffle(arr, rng) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function randInt(lo, hi, rng) {
  return lo + Math.floor(rng() * (hi - lo + 1))
}

/** 去重，保留第一次出现的顺序。 */
export function uniqueBy(arr, keyOf) {
  const seen = new Set()
  const out = []
  for (const it of arr) {
    const k = keyOf(it)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(it)
  }
  return out
}

export function randId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 压成一行、去掉多余空白。 */
export function normText(s) {
  return String(s ?? '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 按字符（不是 UTF-16 码元）截断，超长补省略号。 */
export function excerpt(s, max = 72) {
  const chars = Array.from(normText(s))
  if (chars.length <= max) return chars.join('')
  return chars.slice(0, max).join('') + '…'
}

/** 本地时区的 YYYY-MM-DD。 */
export function localDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(d, n) {
  const out = new Date(d.getTime())
  out.setDate(out.getDate() + n)
  return out
}

export function hhmm(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
