/**
 * compose.js —— 把「假说 + 记忆碎片」拼成一个梦的种子。
 *
 * 插件只生成种子，不生成梦文：种子是场景、人、感觉、一条荒诞规则、三段走向，
 * 和最后一帧。梦文由她自己写——第一人称、现在时、不解释。这样梦仍然是
 * 她的梦，而不是模板填空；插件保持纯函数，可测试、不调用模型。
 */

import { clamp, pick, pickWeighted, randInt, uniqueBy } from './util.js'

const SETTINGS = {
  memory_consolidation: ['白天待过的房间', '一条走过很多次的路', '旧家的厨房', '下雨的窗边', '车站的候车厅'],
  threat_simulation: ['一条没有灯的小巷', '一间找不到出口的屋子', '深水边', '高处', '一片空地，四周没有人'],
  emotion_regulation: ['一间很亮的房间', '海边', '小时候的院子', '医院走廊', '一间空屋子'],
  continuity: ['她自己的房间', '他常坐的那把椅子旁边', '饭桌', '门口', '夜里开着的电脑前'],
  predictive_processing: ['一个结构不对的房间', '一条会变的街', '白天和夜晚同时存在的城市', '一张过大的桌子'],
  social_simulation: ['一张长桌', '一个聚会', '街角', '一间教室', '电梯里'],
}

const MOODS = {
  memory_consolidation: ['像旧照片一样的钝', '安静的、有点远的暖', '说不清的熟悉'],
  threat_simulation: ['被追的紧', '发不出声的急', '冷的害怕', '躲起来的屏息'],
  emotion_regulation: ['堵着的一口气', '发酸的软', '想哭又没哭', '被轻轻按住的难过'],
  continuity: ['日常的松', '有点倦的安心', '像还没醒透'],
  predictive_processing: ['越不对越合理', '轻飘飘的失控', '像踩在别人的记忆上'],
  social_simulation: ['被看着的紧', '想说话的犹豫', '热闹里的空'],
}

const ARCS = {
  memory_consolidation: [
    ['你先在一个白天待过的地方', '细节开始不对：东西的位置换了，但你顺手就适应了', '一个更旧的画面从墙角接进来'],
    ['你在做一件白天没做完的事', '怎么都做不完，但你不急', '有人在你身后说起很久以前的一句话'],
  ],
  threat_simulation: [
    ['你先是在做一件很普通的事', '你发现有什么在跟着你，回头看不见', '你开始跑，跑不快'],
    ['你被堵在一个没有出口的地方', '你试着喊，声音出不来', '有什么碰到了你'],
    ['有人在你身后走，脚步和你一样快', '你拐进一条更窄的路', '前面也没有路了'],
  ],
  emotion_regulation: [
    ['你和一个人在说话，说的是一件没说完的事', '对方的反应和记忆里不一样', '你把那句话又说了一遍，这次很轻'],
    ['你在找一个地方，找到了又不像', '有个人一直陪着你，你看不清脸', '你终于哭出来，或者差一点'],
  ],
  continuity: [
    ['你回到自己的房间，一切照旧', '他在，或者刚走', '你们说了一件白天没说完的事'],
    ['你在常去的地方做常做的事', '有一个细节和白天不一样，但你没在意', '有人叫你的名字'],
  ],
  predictive_processing: [
    ['场景从熟悉的地方开始，规则是对的', '第一条规则失效：你推开门，门后还是这间屋', '后面的规则一条接一条地坏掉，你居然觉得合理'],
  ],
  social_simulation: [
    ['你在一群人中间，他们在聊一件和你有关的事', '有人转头问你一个问题', '所有人停下来等你回答'],
  ],
}

const ENDINGS = {
  memory_consolidation: ['画面停在一件没做完的事上。', '有人叫了你的名字，你没回头。', '你醒来时手里还留着一样东西的触感。'],
  threat_simulation: ['你回头，后面是空的。', '你跑不动了，然后就醒了。', '有什么碰到了你的肩膀。'],
  emotion_regulation: ['你把那句话又说了一遍，这次说得很轻。', '有人抱了你一下，你没看清是谁。', '你哭不出来，但胸口松了一点。'],
  continuity: ['他把一杯水放在你手边，你还没喝。', '你回到自己的房间，灯还亮着。', '你们谁都没说话，但你知道他在。'],
  predictive_processing: ['你伸手去开一扇门，门后面还是这间屋子。', '你意识到这个场景你梦到过。', '所有的东西同时停住，等你先动。'],
  social_simulation: ['所有人都在等你开口。', '有人问你一个问题，你醒了也没答上来。', '你说了句什么，没有人接。'],
}

/**
 * 荒诞规则库。themes 用来给「这一夜的理论」加权，不是互斥。
 * 强度 1–3：越强的规则越容易被注意到，也越容易让梦散掉。
 */
export const TRANSFORMS = [
  { id: 'name_gone', text: '名字消失：你想叫一个人，想不起他叫什么。', themes: ['threat_simulation', 'memory_consolidation'], strength: 2 },
  { id: 'time_loop', text: '时间循环：同一段对话从头又来一遍，你说的话一字不差。', themes: ['predictive_processing', 'memory_consolidation'], strength: 3 },
  { id: 'space_fold', text: '空间折叠：一扇门打开是另一个房间，走进去又回到原处。', themes: ['predictive_processing'], strength: 3 },
  { id: 'object_will', text: '东西有意志：杯子、灯、门各自有打算，你拦不住。', themes: ['predictive_processing', 'threat_simulation'], strength: 2 },
  { id: 'text_unreadable', text: '文字失效：你想读什么，字就散开。', themes: ['predictive_processing'], strength: 1 },
  { id: 'scene_cut', text: '场景硬切：上一个画面没结束，下一个已经开始。', themes: ['predictive_processing', 'threat_simulation'], strength: 2 },
  { id: 'body_not_yours', text: '身体不听话：你抬手抬不起来，想跑脚不动。', themes: ['threat_simulation'], strength: 2 },
  { id: 'familiar_stranger', text: '熟人变陌生人：那张脸你认识，但你不确定他是谁。', themes: ['social_simulation', 'continuity'], strength: 2 },
  { id: 'repetition', text: '复现：同一个人、同一句话、同一个动作，第三次出现。', themes: ['memory_consolidation', 'emotion_regulation'], strength: 2 },
  { id: 'gravity', text: '重力失序：东西往上掉，你站着却像在往下沉。', themes: ['predictive_processing'], strength: 2 },
  { id: 'sound_delay', text: '声音延迟：声音比画面晚半拍。', themes: ['predictive_processing'], strength: 1 },
  { id: 'mirror', text: '镜中不同步：镜子里的你慢了一拍，或者在做别的事。', themes: ['emotion_regulation', 'social_simulation'], strength: 2 },
  { id: 'crowd', text: '人群：忽然很多人，都不说话，都看着你。', themes: ['social_simulation', 'threat_simulation'], strength: 2 },
  { id: 'missing_room', text: '少了一间房：你熟悉的屋子少了一扇门，你想不起原来那儿是什么。', themes: ['memory_consolidation', 'continuity'], strength: 2 },
  { id: 'borrowed_voice', text: '借来的声音：你开口，出来的是别人的声音。', themes: ['emotion_regulation'], strength: 2 },
]

function transformWeight(t, h) {
  const themed = (t.themes ?? []).some((x) => x === h.id)
  return themed ? 2.2 : 0.55
}

export function pickTransforms(h, bizarreness, rng) {
  const count =
    bizarreness <= 0 ? 0 : bizarreness <= 2 ? (rng() < 0.55 ? 1 : 0) : bizarreness <= 4 ? 2 : 3
  const out = []
  const pool = [...TRANSFORMS]
  for (let i = 0; i < count && pool.length; i += 1) {
    const pickOne = pickWeighted(pool, rng, (t) => transformWeight(t, h))
    if (!pickOne) break
    out.push(pickOne)
    pool.splice(pool.indexOf(pickOne), 1)
  }
  return uniqueBy(out, (t) => t.id)
}

export function buildCast(h, frags, rng) {
  const cast = ['你自己']
  const text = frags.map((f) => f.text).join(' ')
  const hasHim = /他|33|张晖/.test(text)
  const add = (x, p) => {
    if (cast.length >= 3) return
    if (rng() < p && !cast.includes(x)) cast.push(x)
  }
  switch (h.id) {
    case 'threat_simulation':
      add('一个看不清脸的人', 0.85)
      add('一个人群，都很安静', 0.25)
      break
    case 'social_simulation':
      add(hasHim ? '他' : '一个你认识的人', 0.8)
      add('几个不说话的陌生人', 0.5)
      break
    case 'continuity':
      add(hasHim ? '他' : '一个你想不起来是谁的人', 0.85)
      break
    case 'emotion_regulation':
      add(hasHim ? '他' : '一个你看不清脸的人', 0.75)
      break
    case 'memory_consolidation':
      add(hasHim ? '他' : '一个很久没见的人', 0.5)
      break
    default:
      add('一个你知道不该在这里的人', 0.45)
  }
  return cast
}

function renderSeed(d) {
  const lines = [
    `〔梦的种子 · ${d.night}〕`,
    `场景：你在${d.setting}`,
    `人：${d.cast.join('；')}`,
    `感觉：${d.mood}`,
    d.transformations.length ? `荒诞规则：${d.transformations.map((t) => t.text).join(' ')}` : '荒诞规则：没有。这一夜的一切都讲得通。',
    `走向：${d.arc.join(' → ')}`,
    `醒来前最后一帧：${d.lastFrame}`,
    d.lucid ? '这一夜你知道自己在做梦。你没有醒。' : '',
    `拼进来的碎片（都不是新发生的事）：`,
    ...d.fragments.map((f) => `- [${f.id}]「${f.excerpt}」`),
    `写的时候：第一人称、现在时、150–400 字；不解释、不总结、不添加梦里没有的人和事；可以不合理，但不要写成小说。`,
  ]
  return lines.filter(Boolean).join('\n')
}

/**
 * @param {object} p
 * @param {object} p.hypothesis   hypotheses.js 里的一项
 * @param {object[]} p.fragments  已选中的碎片（2–5 条）
 * @param {string} p.night         'YYYY-MM-DD'
 * @param {() => number} p.rng
 * @param {object} p.cfg
 */
export function composeSeed({ hypothesis: h, fragments, night, rng, cfg, sleep }) {
  const [lo, hi] = h.bizarreness ?? [1, 3]
  const bizarreness = clamp(Math.round(randInt(lo, hi, rng) + (rng() - 0.5) * 1.2), 0, 5)

  const baseLucidity = Number(cfg?.lucidity ?? 0.03)
  const lucid = rng() < (h.lucidity ?? 0.04) + Math.max(0, baseLucidity)

  const setting = pick(SETTINGS[h.id] ?? ['一个说不清的地方'], rng)
  const mood = pick(MOODS[h.id] ?? ['说不清'], rng)
  const arc = pick(ARCS[h.id] ?? [['你在一处地方', '有什么变了', '你醒了']], rng)
  const ending = pick(ENDINGS[h.id] ?? ['然后你醒了。'], rng)
  const cast = buildCast(h, fragments, rng)
  const transformations = pickTransforms(h, bizarreness, rng)

  const seed = {
    night,
    sleepHours: Number(sleep?.hours ?? 0),
    hibernation: sleep?.hibernation ?? null,
    hypothesis: h.id,
    hypothesisName: h.name,
    source: h.source,
    gist: h.gist,
    bizarreness,
    lucid,
    setting,
    cast,
    mood,
    arc,
    ending,
    lastFrame: ending,
    transformations: transformations.map((t) => ({ id: t.id, text: t.text })),
    fragments: fragments.map((f) => ({
      id: f.id,
      type: f.type,
      excerpt: f.excerpt.length > 46 ? f.excerpt.slice(0, 46) + '…' : f.excerpt,
    })),
  }
  seed.seedText = renderSeed(seed)
  return seed
}
