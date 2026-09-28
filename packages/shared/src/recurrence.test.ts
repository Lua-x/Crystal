import { describe, expect, it } from 'vitest'

import {
  addMonths,
  daysBetween,
  daysInMonth,
  makeDate,
  monthsBetween,
  startOfWeek,
} from './dates.js'
import { firstOccurrence, nextOccurrence, occurrenceAfter } from './recurrence.js'
import { recurrenceInputSchema, type Recurrence } from './schemas/tasks.js'

const rule = (input: Partial<Recurrence> & Pick<Recurrence, 'frequency'>): Recurrence =>
  recurrenceInputSchema.parse(input)

describe('month arithmetic', () => {
  it('knows month lengths and impossible dates', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 12)).toBe(31)
    expect(makeDate(2026, 2, 29)).toBeNull()
    expect(makeDate(2026, 13, 1)).toBeNull()
    expect(makeDate(2028, 2, 29)).toBe('2028-02-29')
  })

  it('adds months and keeps the day where it can', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    // An explicit day restores the anchor's day after a short month.
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31')
  })

  it('counts days, months and weeks', () => {
    expect(daysBetween('2026-09-28', '2026-10-05')).toBe(7)
    expect(daysBetween('2026-10-05', '2026-09-28')).toBe(-7)
    expect(monthsBetween('2026-01-31', '2026-03-01')).toBe(2)
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28')
    expect(startOfWeek('2026-09-28')).toBe('2026-09-28')
  })
})

describe('recurrenceInputSchema', () => {
  it('fills in defaults and keeps weekdays only for weekly rules', () => {
    expect(rule({ frequency: 'daily' })).toEqual({
      frequency: 'daily',
      interval: 1,
      weekdays: [],
      from: 'due',
    })
    expect(rule({ frequency: 'weekly', weekdays: [4, 1, 4] }).weekdays).toEqual([1, 4])
    expect(rule({ frequency: 'monthly', weekdays: [1] }).weekdays).toEqual([])
  })

  it('rejects impossible rules', () => {
    expect(recurrenceInputSchema.safeParse({ frequency: 'daily', interval: 0 }).success).toBe(false)
    expect(recurrenceInputSchema.safeParse({ frequency: 'weekly', weekdays: [7] }).success).toBe(
      false,
    )
  })
})

describe('occurrenceAfter', () => {
  it('repeats every n days', () => {
    const everyThird = rule({ frequency: 'daily', interval: 3 })
    expect(occurrenceAfter(everyThird, '2026-09-28', '2026-09-28')).toBe('2026-10-01')
    expect(occurrenceAfter(everyThird, '2026-09-28', '2026-10-02')).toBe('2026-10-04')
    // Before the anchor, the anchor itself comes first.
    expect(occurrenceAfter(everyThird, '2026-09-28', '2026-09-20')).toBe('2026-09-28')
  })

  it('repeats weekly on the anchor weekday', () => {
    const everyOtherWeek = rule({ frequency: 'weekly', interval: 2 })
    expect(occurrenceAfter(everyOtherWeek, '2026-09-29', '2026-09-29')).toBe('2026-10-13')
  })

  it('repeats weekly on chosen weekdays, also every other week', () => {
    // Tuesdays and Fridays; 2026-09-29 is a Tuesday.
    const tueFri = rule({ frequency: 'weekly', weekdays: [1, 4] })
    expect(occurrenceAfter(tueFri, '2026-09-29', '2026-09-29')).toBe('2026-10-02')
    expect(occurrenceAfter(tueFri, '2026-09-29', '2026-10-02')).toBe('2026-10-06')

    const weekdays = rule({ frequency: 'weekly', weekdays: [0, 1, 2, 3, 4] })
    expect(occurrenceAfter(weekdays, '2026-10-02', '2026-10-02')).toBe('2026-10-05')

    const everyOtherMonday = rule({ frequency: 'weekly', interval: 2, weekdays: [0] })
    expect(occurrenceAfter(everyOtherMonday, '2026-09-28', '2026-09-28')).toBe('2026-10-12')
    expect(occurrenceAfter(everyOtherMonday, '2026-09-28', '2026-10-13')).toBe('2026-10-26')
  })

  it('keeps the day of the month across short months', () => {
    const monthly = rule({ frequency: 'monthly' })
    expect(occurrenceAfter(monthly, '2026-01-31', '2026-01-31')).toBe('2026-02-28')
    expect(occurrenceAfter(monthly, '2026-01-31', '2026-02-28')).toBe('2026-03-31')
    expect(occurrenceAfter(monthly, '2026-01-31', '2026-04-15')).toBe('2026-04-30')

    const quarterly = rule({ frequency: 'monthly', interval: 3 })
    expect(occurrenceAfter(quarterly, '2026-01-15', '2026-01-15')).toBe('2026-04-15')
  })

  it('repeats yearly, including leap days', () => {
    const yearly = rule({ frequency: 'yearly' })
    expect(occurrenceAfter(yearly, '2028-02-29', '2028-02-29')).toBe('2029-02-28')
    expect(occurrenceAfter(yearly, '2028-02-29', '2031-03-01')).toBe('2032-02-29')
  })
})

describe('firstOccurrence', () => {
  it('starts today, or on the next chosen weekday', () => {
    // 2026-09-30 is a Wednesday.
    expect(firstOccurrence(rule({ frequency: 'daily' }), '2026-09-30')).toBe('2026-09-30')
    const tuesdays = rule({ frequency: 'weekly', weekdays: [1] })
    expect(firstOccurrence(tuesdays, '2026-09-30')).toBe('2026-10-06')
    const wednesdays = rule({ frequency: 'weekly', weekdays: [2] })
    expect(firstOccurrence(wednesdays, '2026-09-30')).toBe('2026-09-30')
  })
})

describe('nextOccurrence', () => {
  const today = '2026-09-30' // Wednesday

  it('continues from the due date', () => {
    const daily = rule({ frequency: 'daily' })
    expect(nextOccurrence(daily, { dueDate: today, anchor: null }, today)).toBe('2026-10-01')
    // Completed early: the series goes on from the due date.
    expect(nextOccurrence(daily, { dueDate: '2026-10-03', anchor: null }, today)).toBe('2026-10-04')
  })

  it('never lands in the past when completed late', () => {
    const tuesdays = rule({ frequency: 'weekly', weekdays: [1] })
    // Due on Tuesday two weeks ago, completed today (Wednesday) → next Tuesday.
    expect(nextOccurrence(tuesdays, { dueDate: '2026-09-15', anchor: null }, today)).toBe(
      '2026-10-06',
    )
    const daily = rule({ frequency: 'daily' })
    expect(nextOccurrence(daily, { dueDate: '2026-09-20', anchor: null }, today)).toBe(today)
  })

  it('keeps the anchor day of monthly series', () => {
    const monthly = rule({ frequency: 'monthly' })
    expect(
      nextOccurrence(monthly, { dueDate: '2026-02-28', anchor: '2026-01-31' }, '2026-02-28'),
    ).toBe('2026-03-31')
  })

  it('counts from the day of completion', () => {
    const afterThreeDays = rule({ frequency: 'daily', interval: 3, from: 'completion' })
    expect(nextOccurrence(afterThreeDays, { dueDate: '2026-09-01', anchor: null }, today)).toBe(
      '2026-10-03',
    )
    const monthly = rule({ frequency: 'monthly', from: 'completion' })
    expect(nextOccurrence(monthly, { dueDate: null, anchor: null }, today)).toBe('2026-10-30')
  })
})
