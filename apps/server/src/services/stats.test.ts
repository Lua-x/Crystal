import { describe, expect, it } from 'vitest'

import { streaks } from './stats.js'

describe('streaks', () => {
  it('counts the run up to today, or yesterday while today is still open', () => {
    const days = ['2026-09-25', '2026-09-26', '2026-09-27']
    expect(streaks(days, '2026-09-27')).toEqual({ current: 3, longest: 3 })
    expect(streaks(days, '2026-09-28')).toEqual({ current: 3, longest: 3 })
    expect(streaks(days, '2026-09-29')).toEqual({ current: 0, longest: 3 })
  })

  it('finds the longest run anywhere', () => {
    const days = [
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-09-26',
      '2026-09-27',
    ]
    expect(streaks(days, '2026-09-27')).toEqual({ current: 2, longest: 4 })
    expect(streaks([], '2026-09-27')).toEqual({ current: 0, longest: 0 })
  })

  it('crosses month and year boundaries', () => {
    expect(streaks(['2025-12-31', '2026-01-01'], '2026-01-01')).toEqual({ current: 2, longest: 2 })
  })
})
