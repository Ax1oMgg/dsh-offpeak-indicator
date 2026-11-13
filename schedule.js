/**
 * Pure scheduling core for dsh-offpeak-indicator.
 *
 * The Host half fetches DeepSeek's official pricing page on every Harness
 * launch, parses the peak-hours footnote, and combines it with the Chinese
 * public-holiday calendar. Everything in this module is side-effect free so it
 * can be tested without a browser or a running Harness.
 */

export const PRICING_URL = 'https://api-docs.deepseek.com/quick_start/pricing'
export const PRICING_URL_ZH = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing'

/** Official rules as of the last known pricing page; used before/without network. */
export const FALLBACK_RULE = Object.freeze({
  timezone: 'UTC',
  offsetMinutes: 0,
  weekdays: [1, 2, 3, 4, 5],
  windows: Object.freeze([
    Object.freeze({ start: 60, end: 240 }), // 01:00-04:00 UTC
    Object.freeze({ start: 360, end: 600 }), // 06:00-10:00 UTC
  ]),
  excludeChineseHolidays: true,
  discountPercent: 50,
  source: 'fallback',
})

const DAY_NAMES = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

/** Chinese holidays are civil dates in UTC+8; the offset never changes. */
const CHINA_OFFSET_MINUTES = 8 * 60

const HOLIDAY_SOURCES = (year) => [
  `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
  `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
]

/**
 * Turn an HTML document into normalized text so the pricing footnote can be
 * read without a DOM parser.
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (whole, entity) => {
      const key = String(entity).toLowerCase()
      if (key.startsWith('#x')) {
        const code = Number.parseInt(key.slice(2), 16)
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole
      }
      if (key.startsWith('#')) {
        const code = Number.parseInt(key.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole
      }
      const named = {
        amp: '&',
        apos: "'",
        gt: '>',
        lt: '<',
        nbsp: ' ',
        quot: '"',
      }
      return named[key] ?? whole
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Parse a `HH:MM` clock into minutes after midnight.
 * @param {string} value
 * @returns {number | null}
 */
function clockToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (match === null) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * Split a window that crosses midnight and merge overlapping or touching ones.
 * @param {{ start: number, end: number }[]} windows
 * @returns {{ start: number, end: number }[]}
 */
export function normalizeWindows(windows) {
  const split = []
  for (const window of windows) {
    if (!Number.isInteger(window.start) || !Number.isInteger(window.end)) continue
    if (window.start < 0 || window.start >= 1440 || window.end < 0 || window.end > 1440) continue
    if (window.start === window.end) continue
    if (window.start < window.end) split.push({ start: window.start, end: window.end })
    else {
      split.push({ start: window.start, end: 1440 })
      split.push({ start: 0, end: window.end })
    }
  }
  split.sort((a, b) => a.start - b.start)
  const merged = []
  for (const window of split) {
    const last = merged[merged.length - 1]
    if (last !== undefined && window.start <= last.end) last.end = Math.max(last.end, window.end)
    else merged.push({ ...window })
  }
  return merged
}

/**
 * Read a weekday range or explicit day list from the rule phrase.
 * @param {string} phrase
 * @returns {number[] | null}
 */
function parseWeekdays(phrase) {
  const range = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b\s*(?:through|thru|to|until|–|—|-)\s*\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(phrase)
  if (range !== null) {
    const first = DAY_NAMES[range[1].toLowerCase()]
    const last = DAY_NAMES[range[2].toLowerCase()]
    if (first !== undefined && last !== undefined) {
      const days = []
      for (let day = first; ; day = (day + 1) % 7) {
        days.push(day)
        if (day === last) break
      }
      return days
    }
  }
  const named = [...phrase.matchAll(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi)]
    .map((match) => DAY_NAMES[match[1].toLowerCase()])
    .filter((day) => day !== undefined)
  if (named.length > 0) return [...new Set(named)].sort((a, b) => a - b)
  if (/\bweekdays?\b/i.test(phrase)) return [1, 2, 3, 4, 5]
  return null
}

/** Read clock windows from a phrase; supports `HH:MM - HH:MM` and `to`. */
function parseWindows(phrase) {
  const windows = []
  const pattern = /(\d{1,2}:\d{2})\s*(?:-|–|—|to)\s*(\d{1,2}:\d{2})/gi
  for (const match of phrase.matchAll(pattern)) {
    const start = clockToMinutes(match[1])
    const end = clockToMinutes(match[2])
    if (start !== null && end !== null) windows.push({ start, end })
  }
  return normalizeWindows(windows)
}

/**
 * Parse the peak-hours rule from the official pricing page. The English page is
 * authoritative; the Chinese wording is a fallback with the same semantics.
 * @param {string} html
 * @returns {{timezone: string, offsetMinutes: number, weekdays: number[], windows: {start:number,end:number}[], excludeChineseHolidays: boolean, discountPercent: number, source: string, ruleText: string} | null}
 */
export function parsePricingPage(html) {
  const text = htmlToText(html)
  const match = /Peak hours are\s+([^.]{8,400})\./i.exec(text)
  if (match !== null) {
    const phrase = match[1]
    const windows = parseWindows(phrase)
    if (windows.length === 0) return null

    let timezone = null
    let offsetMinutes = null
    if (/\bUTC\b/.test(phrase) || /\bGMT\b/.test(phrase)) {
      timezone = 'UTC'
      offsetMinutes = 0
    }
    else if (/Beijing|China Standard|北京时间|中国标准时间/i.test(phrase)) {
      timezone = 'Asia/Shanghai'
      offsetMinutes = 8 * 60
    }
    if (timezone === null || offsetMinutes === null) return null

    const weekdays = parseWeekdays(phrase) ?? [1, 2, 3, 4, 5]
    const excludeChineseHolidays = /excluding[^.]*\bholiday/i.test(phrase)
      && /Chinese|China|中国/i.test(phrase)

    let discountPercent = 50
    const percent = /(?:off-peak|discount)[^.]{0,80}?(\d{1,2})\s*%/i.exec(text)
    if (percent !== null) {
      const value = Number(percent[1])
      if (value > 0 && value < 100) discountPercent = value
    }

    return {
      timezone,
      offsetMinutes,
      weekdays,
      windows,
      excludeChineseHolidays,
      discountPercent,
      source: 'live',
      ruleText: phrase.trim(),
    }
  }

  // Chinese page: "北京时间周一至周五（不含中国法定节假日）9:00 - 12:00、
  // 14:00 - 18:00 为高峰时段；其余时段…".
  const chinese = /北京时间([^。]{5,300}?)(?:为高峰时段|是高峰时段)/.exec(text)
  if (chinese === null) return null
  const phrase = chinese[1]
  const windows = parseWindows(phrase)
  if (windows.length === 0) return null
  return {
    timezone: 'Asia/Shanghai',
    offsetMinutes: 8 * 60,
    weekdays: [1, 2, 3, 4, 5],
    windows,
    excludeChineseHolidays: /法定节假日/.test(phrase) || /中国法定节假日/.test(text),
    discountPercent: 50,
    source: 'live',
    ruleText: phrase.trim(),
  }
}

/**
 * Fetch and parse the official pricing page.
 * @param {string} [url]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<ReturnType<typeof parsePricingPage>>}
 */
export async function fetchPricingRule(url = PRICING_URL, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'dsh-offpeak-indicator/1.0 (+https://github.com/)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`pricing page answered HTTP ${response.status}`)
  const rule = parsePricingPage(await response.text())
  if (rule === null) throw new Error('pricing page did not contain a recognizable peak-hours rule')
  rule.pricingUrl = url
  rule.fetchedAt = new Date().toISOString()
  return rule
}

/**
 * Fetch one year of the Chinese public-holiday calendar (`holiday-cn`).
 * @param {number} year
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{year: number, offDays: string[], names: Record<string,string>, source: string} | null>}
 */
export async function fetchHolidayYear(year, fetchImpl = fetch) {
  let lastError = null
  for (const url of HOLIDAY_SOURCES(year)) {
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      })
      if (response.status === 404) continue
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      const days = Array.isArray(payload?.days) ? payload.days : []
      const offDays = []
      const names = {}
      for (const day of days) {
        if (day?.isOffDay !== true) continue
        if (typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) continue
        offDays.push(day.date)
        if (typeof day.name === 'string') names[day.date] = day.name
      }
      return { year, offDays: [...new Set(offDays)].sort(), names, source: url }
    }
    catch (error) {
      lastError = error
    }
  }
  if (lastError !== null) throw lastError
  return null
}

/**
 * Flatten fetched years into a lookup Set.
 * @param {{year:number,offDays:string[]}[]} years
 * @returns {Set<string>}
 */
export function holidaySet(years) {
  const set = new Set()
  for (const year of Array.isArray(years) ? years : []) {
    for (const date of year?.offDays ?? []) set.add(date)
  }
  return set
}

/** Format the date in a fixed UTC offset as YYYY-MM-DD. */
function dateKeyAt(ms, offsetMinutes) {
  const shifted = new Date(ms + offsetMinutes * 60_000)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Whether the given instant is inside a peak window.
 * @param {number} ms
 * @param {ReturnType<typeof parsePricingPage>} rule
 * @param {Set<string>} holidays
 * @returns {boolean}
 */
export function isPeakAt(ms, rule, holidays) {
  if (rule.excludeChineseHolidays && holidays.has(dateKeyAt(ms, CHINA_OFFSET_MINUTES))) return false
  const shifted = new Date(ms + rule.offsetMinutes * 60_000)
  if (!rule.weekdays.includes(shifted.getUTCDay())) return false
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  return rule.windows.some((window) => minutes >= window.start && minutes < window.end)
}

/**
 * Find the first minute boundary at which the peak/off-peak state differs.
 * @param {number} fromMs
 * @param {boolean} fromPeak
 * @param {ReturnType<typeof parsePricingPage>} rule
 * @param {Set<string>} holidays
 * @returns {number | null}
 */
export function findNextTransition(fromMs, fromPeak, rule, holidays) {
  let cursor = Math.floor(fromMs / 60_000) * 60_000 + 60_000
  const limit = cursor + 21 * 1440 * 60_000
  while (cursor <= limit) {
    if (isPeakAt(cursor, rule, holidays) !== fromPeak) return cursor
    cursor += 60_000
  }
  return null
}

/**
 * Compute the complete public state for one instant.
 * @param {{rule: ReturnType<typeof parsePricingPage>, holidays: Set<string>, now?: number}} input
 */
export function computeState({ rule, holidays, now = Date.now() }) {
  const peak = isPeakAt(now, rule, holidays)
  const next = findNextTransition(now, peak, rule, holidays)
  let nextOffpeak = null
  if (peak) nextOffpeak = next
  else if (next !== null) nextOffpeak = findNextTransition(next, true, rule, holidays)

  return {
    status: peak ? 'peak' : 'offpeak',
    nextChangeAt: next === null ? null : new Date(next).toISOString(),
    nextStatus: peak ? 'offpeak' : 'peak',
    nextOffpeakAt: nextOffpeak === null ? null : new Date(nextOffpeak).toISOString(),
    serverNow: new Date(now).toISOString(),
    discountPercent: rule.discountPercent,
    schedule: {
      timezone: rule.timezone,
      offsetMinutes: rule.offsetMinutes,
      weekdays: rule.weekdays,
      windows: rule.windows,
      excludeChineseHolidays: rule.excludeChineseHolidays,
      ruleText: rule.ruleText ?? null,
    },
  }
}
