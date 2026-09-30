import { describe, expect, it } from 'vitest'

import { deadlineState, formatRarity, gameProgress } from './game-logic'

describe('gameProgress', () => {
  it('counts done goals against all goals', () => {
    expect(gameProgress({ openCount: 28, completedCount: 12 })).toEqual({
      done: 12,
      total: 40,
      percent: 30,
    })
  })

  it('only shows 100 % once everything is done', () => {
    expect(gameProgress({ openCount: 1, completedCount: 249 })?.percent).toBe(99)
    expect(gameProgress({ openCount: 0, completedCount: 250 })?.percent).toBe(100)
  })

  it('has nothing to show without goals', () => {
    expect(gameProgress({ openCount: 0, completedCount: 0 })).toBeNull()
  })
})

describe('formatRarity', () => {
  it('shows rare achievements precisely and common ones rounded', () => {
    expect(formatRarity(6.8, 'en')).toBe('6.8%')
    expect(formatRarity(0.1, 'en')).toBe('0.1%')
    expect(formatRarity(71.4, 'en')).toBe('71%')
    // German puts a no-break space before the percent sign.
    expect(formatRarity(6.8, 'de').replace(/\s/g, ' ')).toBe('6,8 %')
  })
})

describe('deadlineState', () => {
  it('counts the days that are left', () => {
    expect(deadlineState('2026-10-31', '2026-09-30')).toEqual({ kind: 'left', days: 31 })
    expect(deadlineState('2026-10-01', '2026-09-30')).toEqual({ kind: 'left', days: 1 })
  })

  it('knows when the day has come', () => {
    expect(deadlineState('2026-09-30', '2026-09-30')).toEqual({ kind: 'today' })
  })

  it('counts the days past the date', () => {
    expect(deadlineState('2026-09-27', '2026-09-30')).toEqual({ kind: 'over', days: 3 })
  })

  it('is not thrown off by daylight saving time', () => {
    expect(deadlineState('2026-10-26', '2026-10-24')).toEqual({ kind: 'left', days: 2 })
    expect(deadlineState('2027-03-29', '2027-03-27')).toEqual({ kind: 'left', days: 2 })
  })
})
