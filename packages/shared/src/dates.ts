/*
 * Calendar dates as `YYYY-MM-DD` strings. Due dates are "floating": they mean a
 * day in the user's own time zone, not an instant, so they are never converted
 * between time zones.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function parse(date: string): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(date)
  if (!match) throw new Error(`Invalid date: ${date}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function format(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** The calendar date at `instant` in the given IANA time zone. */
export function todayIn(timeZone: string, instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return format(value('year'), value('month'), value('day'))
}

export function addDays(date: string, days: number): string {
  const { year, month, day } = parse(date)
  const result = new Date(Date.UTC(year, month - 1, day + days))
  return format(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate())
}

/** Day of the week, 0 = Monday … 6 = Sunday (ISO order). */
export function isoWeekday(date: string): number {
  const { year, month, day } = parse(date)
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
}

/** The Sunday that ends the (ISO) week containing `date`. */
export function endOfWeek(date: string): string {
  return addDays(date, 6 - isoWeekday(date))
}

export const PLANNED_BUCKETS = ['overdue', 'today', 'tomorrow', 'thisWeek', 'later'] as const
export type PlannedBucket = (typeof PLANNED_BUCKETS)[number]

/** Groups a due date relative to today, as in the "Planned" list. */
export function plannedBucket(dueDate: string, today: string): PlannedBucket {
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  if (dueDate === addDays(today, 1)) return 'tomorrow'
  if (dueDate <= endOfWeek(today)) return 'thisWeek'
  return 'later'
}
