import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FALLBACK_RULE,
  computeState,
  findNextTransition,
  holidaySet,
  isPeakAt,
  normalizeWindows,
  parsePricingPage,
} from '../schedule.js'

const OFFICIAL_HTML = `
  <p>(2) Off-peak rates are half of the peak rates. Peak hours are
  01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday, excluding
  Chinese public holidays. All other hours are off-peak, including weekends
  and Chinese public holidays in full.</p>
`

test('parses the official peak-hours rule', () => {
  const rule = parsePricingPage(OFFICIAL_HTML)
  assert.notEqual(rule, null)
  assert.equal(rule.timezone, 'UTC')
  assert.equal(rule.offsetMinutes, 0)
  assert.deepEqual(rule.weekdays, [1, 2, 3, 4, 5])
  assert.deepEqual(rule.windows, [{ start: 60, end: 240 }, { start: 360, end: 600 }])
  assert.equal(rule.excludeChineseHolidays, true)
  assert.equal(rule.discountPercent, 50)
})

test('parses the Chinese wording as a fallback', () => {
  const rule = parsePricingPage('<p>(2) 空闲时段价格为高峰时段价格的一半。北京时间周一至周五（不含中国法定节假日）9:00 - 12:00、14:00 - 18:00 为高峰时段；其余时段，包括周末及中国法定节假日全天均为空闲时段。</p>')
  assert.notEqual(rule, null)
  assert.equal(rule.timezone, 'Asia/Shanghai')
  assert.equal(rule.offsetMinutes, 480)
  assert.deepEqual(rule.windows, [{ start: 540, end: 720 }, { start: 840, end: 1080 }])
  assert.equal(rule.excludeChineseHolidays, true)
})

test('rejects a page without the footnote', () => {
  assert.equal(parsePricingPage('<p>Models and prices</p>'), null)
})

test('normalizes windows that cross midnight and merges overlaps', () => {
  assert.deepEqual(normalizeWindows([{ start: 1380, end: 120 }]), [
    { start: 0, end: 120 },
    { start: 1380, end: 1440 },
  ])
  assert.deepEqual(normalizeWindows([{ start: 60, end: 240 }, { start: 240, end: 300 }]), [
    { start: 60, end: 300 },
  ])
})

test('detects peak windows in UTC', () => {
  const rule = FALLBACK_RULE
  const none = holidaySet([])
  assert.equal(isPeakAt(Date.parse('2026-11-13T02:06:00Z'), rule, none), true)
  assert.equal(isPeakAt(Date.parse('2026-11-13T04:00:00Z'), rule, none), false)
  assert.equal(isPeakAt(Date.parse('2026-11-13T05:00:00Z'), rule, none), false)
  assert.equal(isPeakAt(Date.parse('2026-11-13T06:00:00Z'), rule, none), true)
  assert.equal(isPeakAt(Date.parse('2026-11-13T10:00:00Z'), rule, none), false)
  assert.equal(isPeakAt(Date.parse('2026-11-14T02:00:00Z'), rule, none), false)
})

test('a Chinese public holiday is off-peak for the whole civil day', () => {
  const rule = FALLBACK_RULE
  const holidays = holidaySet([{ year: 2026, offDays: ['2026-01-01'] }])
  assert.equal(isPeakAt(Date.parse('2025-12-31T02:00:00Z'), rule, holidays), true)
  assert.equal(isPeakAt(Date.parse('2026-01-01T02:00:00Z'), rule, holidays), false)
  assert.equal(isPeakAt(Date.parse('2026-01-02T02:00:00Z'), rule, holidays), true)
})

test('finds the next transition across a weekend', () => {
  const rule = FALLBACK_RULE
  const none = holidaySet([])
  assert.equal(
    new Date(findNextTransition(Date.parse('2026-11-13T02:06:00Z'), true, rule, none)).toISOString(),
    '2026-11-13T04:00:00.000Z',
  )
  assert.equal(
    new Date(findNextTransition(Date.parse('2026-11-13T10:00:00Z'), false, rule, none)).toISOString(),
    '2026-11-16T01:00:00.000Z',
  )
})

test('computeState reports the current phase and the next switch', () => {
  const state = computeState({
    rule: FALLBACK_RULE,
    holidays: holidaySet([]),
    now: Date.parse('2026-11-13T02:06:00Z'),
  })
  assert.equal(state.status, 'peak')
  assert.equal(state.nextStatus, 'offpeak')
  assert.equal(state.nextChangeAt, '2026-11-13T04:00:00.000Z')

  const offpeak = computeState({
    rule: FALLBACK_RULE,
    holidays: holidaySet([]),
    now: Date.parse('2026-11-13T04:30:00Z'),
  })
  assert.equal(offpeak.status, 'offpeak')
  assert.equal(offpeak.nextChangeAt, '2026-11-13T06:00:00.000Z')
  assert.equal(offpeak.nextOffpeakAt, '2026-11-13T10:00:00.000Z')
})
