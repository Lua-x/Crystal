import {
  addDays,
  addMonths,
  dayOfMonth,
  daysBetween,
  isoWeekday,
  monthsBetween,
  startOfWeek,
} from './dates.js'
import type { Recurrence } from './schemas/tasks.js'

/*
 * Repeating tasks. A rule produces a series of dates starting at an anchor
 * (the due date the series started with). Completing a task creates the next
 * occurrence as a new task, so history stays intact.
 */

/**
 * The first date strictly after `after` in the series that `rule` produces
 * from `anchor`. Monthly and yearly series keep the anchor's day of the month,
 * falling back to the last day of shorter months (31 January → 28 February →
 * 31 March).
 */
export function occurrenceAfter(rule: Recurrence, anchor: string, after: string): string {
  const { frequency, interval } = rule

  if (frequency === 'daily' || (frequency === 'weekly' && rule.weekdays.length === 0)) {
    const step = frequency === 'daily' ? interval : interval * 7
    const elapsed = daysBetween(anchor, after)
    const steps = elapsed < 0 ? 0 : Math.floor(elapsed / step) + 1
    return addDays(anchor, steps * step)
  }

  if (frequency === 'weekly') {
    // Every `interval` weeks, counted from the anchor's week, on the given weekdays.
    const firstWeek = startOfWeek(anchor)
    const weeksElapsed = Math.floor(daysBetween(firstWeek, startOfWeek(after)) / 7)
    let cycle = Math.max(0, Math.floor(weeksElapsed / interval))
    for (;;) {
      const week = addDays(firstWeek, cycle * interval * 7)
      for (const weekday of rule.weekdays) {
        const candidate = addDays(week, weekday)
        if (candidate >= anchor && candidate > after) return candidate
      }
      cycle++
    }
  }

  const months = frequency === 'monthly' ? interval : interval * 12
  const day = dayOfMonth(anchor)
  const elapsed = monthsBetween(anchor, after)
  let steps = Math.max(0, Math.floor(elapsed / months))
  for (;;) {
    const candidate = addMonths(anchor, steps * months, day)
    if (candidate > after) return candidate
    steps++
  }
}

/**
 * The due date for a new repeating task without one: today, or for rules with
 * weekdays the first of them from today on.
 */
export function firstOccurrence(rule: Recurrence, today: string): string {
  if (rule.frequency !== 'weekly' || rule.weekdays.length === 0) return today
  const weekday = isoWeekday(today)
  const offsets = rule.weekdays.map((day) => (day - weekday + 7) % 7)
  return addDays(today, Math.min(...offsets))
}

/**
 * The due date of the occurrence that follows a completed task.
 *
 * - Counted from the due date, the series continues where it was – but never
 *   in the past: a weekly task completed two weeks late becomes due on its
 *   next day from today on, not on one that has already passed.
 * - Counted from completion, the interval starts on the day of completion.
 */
export function nextOccurrence(
  rule: Recurrence,
  task: { dueDate: string | null; anchor: string | null },
  today: string,
): string {
  if (rule.from === 'completion') return occurrenceAfter(rule, today, today)
  const dueDate = task.dueDate ?? today
  const anchor = task.anchor ?? dueDate
  const yesterday = addDays(today, -1)
  return occurrenceAfter(rule, anchor, dueDate > yesterday ? dueDate : yesterday)
}
