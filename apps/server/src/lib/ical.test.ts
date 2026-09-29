import { describe, expect, it } from 'vitest'

import { escapeText, foldLine, formatUtc, renderCalendar } from './ical.js'

describe('iCalendar helpers', () => {
  it('escapes text values', () => {
    expect(escapeText('Milk, eggs; bread\\butter\nand more')).toBe(
      'Milk\\, eggs\\; bread\\\\butter\\nand more',
    )
  })

  it('folds long lines at 75 octets without splitting characters', () => {
    const line = `SUMMARY:${'ä'.repeat(60)}`
    const folded = foldLine(line)
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    expect(parts.slice(1).every((part) => part.startsWith(' '))).toBe(true)
    expect(parts.map((part, index) => (index === 0 ? part : part.slice(1))).join('')).toBe(line)
    expect(foldLine('SHORT:line')).toBe('SHORT:line')
  })

  it('formats instants in UTC', () => {
    expect(formatUtc(new Date('2026-10-01T16:05:09.123Z'))).toBe('20261001T160509Z')
  })

  it('renders all-day and timed events with CRLF line endings', () => {
    const text = renderCalendar({
      productId: '-//Crystal//Test//EN',
      name: 'Crystal',
      refreshInterval: 'PT1H',
      events: [
        {
          uid: 'a@crystal',
          stamp: new Date('2026-09-29T10:00:00Z'),
          summary: 'Pay rent',
          time: { kind: 'date', date: '2026-10-31' },
          categories: ['home', 'money'],
        },
        {
          uid: 'b@crystal',
          stamp: new Date('2026-09-29T10:00:00Z'),
          summary: 'Dentist',
          description: 'Bring the card',
          url: 'https://todo.example.com/lists/x?task=b',
          time: {
            kind: 'instant',
            start: new Date('2026-10-01T07:15:00Z'),
            end: new Date('2026-10-01T07:45:00Z'),
          },
        },
      ],
    })
    expect(text.endsWith('\r\n')).toBe(true)
    expect(text.split('\r\n').every((line) => !line.includes('\n'))).toBe(true)
    expect(text).toContain('DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101')
    expect(text).toContain('CATEGORIES:home,money')
    expect(text).toContain('DTSTART:20261001T071500Z\r\nDTEND:20261001T074500Z')
    expect(text).toContain('URL:https://todo.example.com/lists/x?task=b')
  })
})
