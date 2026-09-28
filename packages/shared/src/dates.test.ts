import { describe, expect, it } from 'vitest'

import { addDays, endOfWeek, isoWeekday, plannedBucket, todayIn } from './dates.js'
import { keyBetween, keysBetween } from './positions.js'

describe('todayIn', () => {
  const instant = new Date('2026-09-27T23:30:00Z')

  it('uses the given time zone', () => {
    expect(todayIn('UTC', instant)).toBe('2026-09-27')
    expect(todayIn('Europe/Berlin', instant)).toBe('2026-09-28')
    expect(todayIn('America/Los_Angeles', instant)).toBe('2026-09-27')
  })
})

describe('calendar arithmetic', () => {
  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('knows weekdays and week ends (Monday first)', () => {
    expect(isoWeekday('2026-09-28')).toBe(0) // Monday
    expect(isoWeekday('2026-09-27')).toBe(6) // Sunday
    expect(endOfWeek('2026-09-28')).toBe('2026-10-04')
    expect(endOfWeek('2026-09-27')).toBe('2026-09-27')
  })
})

describe('plannedBucket', () => {
  // Wednesday, 30 September 2026.
  const today = '2026-09-30'

  it.each([
    ['2026-09-29', 'overdue'],
    ['2026-09-30', 'today'],
    ['2026-10-01', 'tomorrow'],
    ['2026-10-04', 'thisWeek'],
    ['2026-10-05', 'later'],
  ] as const)('%s is %s', (date, bucket) => {
    expect(plannedBucket(date, today)).toBe(bucket)
  })
})

describe('positions', () => {
  it('generates keys that sort between their neighbours', () => {
    const first = keyBetween(null, null)
    const after = keyBetween(first, null)
    const before = keyBetween(null, first)
    const middle = keyBetween(first, after)
    expect([after, middle, before, first].sort()).toEqual([before, first, middle, after])
  })

  it('spreads many keys evenly', () => {
    const keys = keysBetween(null, null, 50)
    expect([...keys].sort()).toEqual(keys)
    expect(new Set(keys).size).toBe(50)
  })
})
