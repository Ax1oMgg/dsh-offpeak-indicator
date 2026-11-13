/**
 * Host half of dsh-offpeak-indicator.
 *
 * On every Harness launch this half asks DeepSeek's official pricing page for
 * the current peak-hours rule and pulls the Chinese public-holiday calendar,
 * caches both, and serves a small JSON snapshot to the browser half. When the
 * network is unavailable the last known rule keeps working and the UI says so.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  FALLBACK_RULE,
  PRICING_URL,
  computeState,
  fetchHolidayYear,
  fetchPricingRule,
  holidaySet,
  normalizeWindows,
} from './schedule.js'

export const inject = ['webServer']

const ROUTE = '/offpeak-indicator/state'
const CACHE_VERSION = 1
const REFRESH_MS = 6 * 60 * 60 * 1000
const STARTUP_DELAY_MS = 150

/** Resolve the profile data directory the same way DSH does. */
function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

function cachePath() {
  return path.join(dshHome(), 'offpeak-indicator.json')
}

function readCache(logger) {
  try {
    const raw = fs.readFileSync(cachePath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed?.version !== CACHE_VERSION) return null
    const rule = sanitizeRule(parsed.rule)
    if (rule === null) return null
    const years = Array.isArray(parsed.holidayYears)
      ? parsed.holidayYears.filter((year) => Number.isInteger(year?.year) && Array.isArray(year.offDays))
      : []
    return {
      rule,
      holidayYears: years,
      fetchedAt: typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : null,
    }
  }
  catch (error) {
    if (error?.code !== 'ENOENT') logger?.warn?.(`offpeak-indicator: cache read failed: ${error.message}`)
    return null
  }
}

function sanitizeRule(value) {
  if (value === null || typeof value !== 'object') return null
  if (!Number.isInteger(value.offsetMinutes) || typeof value.timezone !== 'string') return null
  if (!Array.isArray(value.weekdays) || value.weekdays.length === 0) return null
  if (!Array.isArray(value.windows) || value.windows.length === 0) return null
  const windows = normalizeWindows(value.windows)
  if (windows.length === 0) return null
  return {
    timezone: value.timezone,
    offsetMinutes: value.offsetMinutes,
    weekdays: [...new Set(value.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day < 7))].sort((a, b) => a - b),
    windows,
    excludeChineseHolidays: value.excludeChineseHolidays !== false,
    discountPercent: Number.isFinite(value.discountPercent) ? value.discountPercent : 50,
    source: typeof value.source === 'string' ? value.source : 'cache',
    ruleText: typeof value.ruleText === 'string' ? value.ruleText : null,
    pricingUrl: typeof value.pricingUrl === 'string' ? value.pricingUrl : PRICING_URL,
  }
}

function writeCache(payload, logger) {
  const target = cachePath()
  const temporary = `${target}.${process.pid}.tmp`
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(temporary, JSON.stringify(payload, null, 2), 'utf8')
    fs.renameSync(temporary, target)
  }
  catch (error) {
    logger?.warn?.(`offpeak-indicator: cache write failed: ${error.message}`)
    try { fs.unlinkSync(temporary) } catch {}
  }
}

function mergeHolidayYears(previous, incoming) {
  const byYear = new Map()
  for (const year of [...previous, ...incoming]) {
    if (!Number.isInteger(year?.year)) continue
    const existing = byYear.get(year.year)
    if (existing === undefined || (year.offDays?.length ?? 0) >= (existing.offDays?.length ?? 0)) byYear.set(year.year, year)
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year)
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

export function apply(ctx) {
  const cached = readCache(ctx.logger)
  let rule = cached?.rule ?? FALLBACK_RULE
  let holidayYears = cached?.holidayYears ?? []
  let fetchedAt = cached?.fetchedAt ?? null
  let mode = cached === null ? 'fallback' : 'cache'
  let lastError = null
  let refreshing = null
  let disposed = false

  const snapshot = () => {
    const holidays = holidaySet(holidayYears)
    const state = computeState({ rule, holidays })
    return {
      ok: true,
      ...state,
      data: {
        mode,
        fetchedAt,
        pricingUrl: rule.pricingUrl ?? PRICING_URL,
        holidayYears: holidayYears.map((year) => year.year),
        errors: lastError === null ? [] : [lastError],
      },
    }
  }

  const refresh = (reason) => {
    if (refreshing !== null) return refreshing
    refreshing = (async () => {
      const errors = []
      let nextRule = rule
      let pricingOk = false

      try {
        nextRule = await fetchPricingRule(PRICING_URL)
        pricingOk = true
      }
      catch (error) {
        errors.push(`pricing: ${messageOf(error)}`)
        try {
          nextRule = await fetchPricingRule(PRICING_URL_ZH)
          pricingOk = true
        }
        catch (fallbackError) {
          errors.push(`pricing (zh): ${messageOf(fallbackError)}`)
        }
      }

      const currentYear = new Date().getFullYear()
      const fetched = await Promise.all(
        [currentYear, currentYear + 1].map(async (year) => {
          try {
            return await fetchHolidayYear(year)
          }
          catch (error) {
            errors.push(`holidays ${year}: ${messageOf(error)}`)
            return null
          }
        }),
      )
      const usable = fetched.filter((year) => year !== null && year.offDays.length > 0)
      if (usable.length > 0) holidayYears = mergeHolidayYears(holidayYears, usable)
      else if (holidayYears.length === 0) errors.push('holidays: no calendar could be loaded')

      if (pricingOk) {
        rule = nextRule
        mode = 'live'
        fetchedAt = new Date().toISOString()
      }
      else {
        mode = cached === null && rule.source === 'fallback' ? 'fallback' : 'cache'
      }
      lastError = errors.length === 0 ? null : errors.join('; ')

      if (pricingOk || usable.length > 0) {
        writeCache({
          version: CACHE_VERSION,
          fetchedAt,
          rule,
          holidayYears,
        }, ctx.logger)
      }

      if (pricingOk) {
        ctx.logger?.info?.(`offpeak-indicator: pricing rules refreshed (${reason}); peak windows ${rule.windows.map((window) => `${window.start}-${window.end}`).join(', ')} min ${rule.timezone}`)
      }
      else {
        ctx.logger?.warn?.(`offpeak-indicator: keeping ${mode} rules — ${lastError}`)
      }
    })().finally(() => {
      refreshing = null
      if (disposed) return
    })
    return refreshing
  }

  const route = async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' })
      res.end('Method Not Allowed')
      return
    }
    try {
      const url = new URL(req.url ?? ROUTE, 'http://localhost')
      if (url.searchParams.get('refresh') === '1') await refresh('client')
      const body = JSON.stringify(snapshot())
      res.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
      })
      res.end(req.method === 'HEAD' ? undefined : body)
    }
    catch (error) {
      ctx.logger?.warn?.(`offpeak-indicator: route failed: ${messageOf(error)}`)
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: messageOf(error) }))
      }
      else res.end()
    }
  }

  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: ROUTE, handler: route }),
    'offpeak-indicator: state route',
  )

  const startupTimer = setTimeout(() => { void refresh('startup') }, STARTUP_DELAY_MS)
  const periodicTimer = setInterval(() => { void refresh('periodic') }, REFRESH_MS)

  ctx.effect(() => () => {
    disposed = true
    clearTimeout(startupTimer)
    clearInterval(periodicTimer)
  }, 'offpeak-indicator: refresh timers')
}
