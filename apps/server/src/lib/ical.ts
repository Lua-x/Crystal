/*
 * A small iCalendar (RFC 5545) writer for read-only feeds: text escaping,
 * line folding and the few properties Crystal needs.
 */

const MAX_LINE_OCTETS = 75

/** Escapes a TEXT value: backslash, semicolon, comma and line breaks. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Folds a content line into pieces of at most 75 octets; continuation lines
 * start with a space. Never splits a multi-byte character.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= MAX_LINE_OCTETS) return line
  const parts: string[] = []
  let current = ''
  let octets = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    // Continuation lines lose one octet to the leading space.
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1
    if (octets + size > limit) {
      parts.push(current)
      current = ''
      octets = 0
    }
    current += char
    octets += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

/** `2026-10-01` → `20261001` */
export function formatDate(date: string): string {
  return date.replace(/-/g, '')
}

/** An instant in UTC: `20261001T160000Z`. */
export function formatUtc(instant: Date): string {
  return instant
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

export type EventTime = { kind: 'date'; date: string } | { kind: 'instant'; start: Date; end: Date }

export interface CalendarEvent {
  uid: string
  stamp: Date
  summary: string
  description?: string | undefined
  url?: string | undefined
  categories?: readonly string[]
  time: EventTime
}

export interface Calendar {
  productId: string
  name: string
  /** How often clients should check for changes, e.g. `PT1H`. */
  refreshInterval: string
  events: readonly CalendarEvent[]
}

function nextDay(date: string): string {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

/** Renders the calendar with CRLF line endings, as the standard requires. */
export function renderCalendar(calendar: Calendar): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${calendar.productId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendar.name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${calendar.refreshInterval}`,
    `X-PUBLISHED-TTL:${calendar.refreshInterval}`,
  ]
  for (const event of calendar.events) {
    lines.push('BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${formatUtc(event.stamp)}`)
    if (event.time.kind === 'date') {
      lines.push(
        `DTSTART;VALUE=DATE:${formatDate(event.time.date)}`,
        `DTEND;VALUE=DATE:${formatDate(nextDay(event.time.date))}`,
      )
    } else {
      lines.push(`DTSTART:${formatUtc(event.time.start)}`, `DTEND:${formatUtc(event.time.end)}`)
    }
    lines.push(`SUMMARY:${escapeText(event.summary)}`)
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
    if (event.url) lines.push(`URL:${event.url}`)
    if (event.categories && event.categories.length > 0) {
      lines.push(`CATEGORIES:${event.categories.map(escapeText).join(',')}`)
    }
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
