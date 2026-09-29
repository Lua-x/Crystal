import { describe, expect, it } from 'vitest'

import { instantToZonedTime, isValidTimeZone, zonedTimeToInstant } from './timezone.js'

describe('time zones', () => {
  it('recognizes valid zones', () => {
    expect(isValidTimeZone('Europe/Berlin')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
  })

  it('converts local times to instants and back', () => {
    const instant = zonedTimeToInstant('2026-09-28', '09:30', 'Europe/Berlin')
    expect(instant.toISOString()).toBe('2026-09-28T07:30:00.000Z')
    expect(instantToZonedTime(instant, 'Europe/Berlin')).toEqual({
      date: '2026-09-28',
      time: '09:30',
    })
    expect(zonedTimeToInstant('2026-12-01', '09:30', 'Europe/Berlin').toISOString()).toBe(
      '2026-12-01T08:30:00.000Z',
    )
    expect(zonedTimeToInstant('2026-09-28', '23:00', 'America/New_York').toISOString()).toBe(
      '2026-09-29T03:00:00.000Z',
    )
    expect(instantToZonedTime(new Date('2026-09-29T03:00:00Z'), 'Pacific/Auckland')).toEqual({
      date: '2026-09-29',
      time: '16:00',
    })
  })

  it('moves times in the spring gap to just after the jump', () => {
    // On 29 March 2026, clocks in Berlin jump from 02:00 to 03:00.
    const instant = zonedTimeToInstant('2026-03-29', '02:30', 'Europe/Berlin')
    expect(instantToZonedTime(instant, 'Europe/Berlin')).toEqual({
      date: '2026-03-29',
      time: '03:30',
    })
  })

  it('picks the first of two identical times in autumn', () => {
    // On 25 October 2026, 02:30 happens twice in Berlin; the first is still summer time.
    expect(zonedTimeToInstant('2026-10-25', '02:30', 'Europe/Berlin').toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    )
  })
})
