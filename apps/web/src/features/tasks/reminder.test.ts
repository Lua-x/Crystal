import { describe, expect, it } from 'vitest'

import { fromLocalInput, reminderOptions, reminderParts, toLocalInput } from './reminder'

const BERLIN = 'Europe/Berlin'

describe('reminderOptions', () => {
  it('offers later today, tomorrow and next week in the user’s time zone', () => {
    // Sunday, 27 September 2026, 12:20 in Berlin.
    const now = new Date('2026-09-27T10:20:00Z')
    expect(reminderOptions(now, BERLIN, { dueDate: null, dueTime: null })).toEqual([
      { preset: 'laterToday', at: '2026-09-27T14:00:00.000Z' },
      { preset: 'tomorrow', at: '2026-09-28T07:00:00.000Z' },
      { preset: 'nextWeek', at: '2026-09-28T07:00:00.000Z' },
    ])
  })

  it('skips later today in the evening and adds the due date', () => {
    const now = new Date('2026-09-29T17:00:00Z') // Tuesday, 19:00 in Berlin
    const options = reminderOptions(now, BERLIN, { dueDate: '2026-10-02', dueTime: '18:30' })
    expect(options.map((option) => option.preset)).toEqual(['tomorrow', 'nextWeek', 'onDue'])
    expect(options.at(-1)!.at).toBe('2026-10-02T16:30:00.000Z')
    expect(options[1]!.at).toBe('2026-10-05T07:00:00.000Z')
  })

  it('leaves out a due date that has passed', () => {
    const now = new Date('2026-09-29T10:00:00Z')
    const options = reminderOptions(now, BERLIN, { dueDate: '2026-09-29', dueTime: null })
    expect(options.map((option) => option.preset)).not.toContain('onDue')
  })
})

describe('datetime-local conversion', () => {
  it('round-trips through the user’s time zone, also in winter time', () => {
    expect(toLocalInput('2026-10-31T08:00:00.000Z', BERLIN)).toBe('2026-10-31T09:00')
    expect(fromLocalInput('2026-10-31T09:00', BERLIN)).toBe('2026-10-31T08:00:00.000Z')
    expect(fromLocalInput('', BERLIN)).toBeNull()
    expect(reminderParts('2026-09-28T07:00:00.000Z', BERLIN)).toEqual({
      dueDate: '2026-09-28',
      dueTime: '09:00',
    })
  })
})
