import { addDays, instantToZonedTime, isoWeekday, zonedTimeToInstant } from '@crystal/shared'

/** Reminders without a more specific time go off in the morning. */
export const DEFAULT_REMINDER_TIME = '09:00'
/** "Later today" is not offered after this hour. */
const LATEST_LATER_HOUR = 21

export type ReminderPreset = 'laterToday' | 'tomorrow' | 'nextWeek' | 'onDue'

export interface ReminderOption {
  preset: ReminderPreset
  /** ISO instant. */
  at: string
}

/**
 * Quick choices, in the user's time zone: a few hours from now (on the full
 * hour), tomorrow morning, next Monday morning, and when the task is due.
 */
export function reminderOptions(
  now: Date,
  timeZone: string,
  due: { dueDate: string | null; dueTime: string | null },
): ReminderOption[] {
  const local = instantToZonedTime(now, timeZone)
  const at = (date: string, time: string) => zonedTimeToInstant(date, time, timeZone)
  const options: ReminderOption[] = []

  const [hours = 0, minutes = 0] = local.time.split(':').map(Number)
  const laterHour = hours + (minutes > 0 ? 4 : 3)
  if (laterHour <= LATEST_LATER_HOUR) {
    options.push({
      preset: 'laterToday',
      at: at(local.date, `${String(laterHour).padStart(2, '0')}:00`).toISOString(),
    })
  }
  options.push({
    preset: 'tomorrow',
    at: at(addDays(local.date, 1), DEFAULT_REMINDER_TIME).toISOString(),
  })
  options.push({
    preset: 'nextWeek',
    at: at(addDays(local.date, 7 - isoWeekday(local.date)), DEFAULT_REMINDER_TIME).toISOString(),
  })
  if (due.dueDate) {
    const onDue = at(due.dueDate, due.dueTime ?? DEFAULT_REMINDER_TIME)
    if (onDue > now) options.push({ preset: 'onDue', at: onDue.toISOString() })
  }
  return options
}

/** The value of a `datetime-local` input for an instant (`YYYY-MM-DDTHH:MM`). */
export function toLocalInput(instant: string, timeZone: string): string {
  const { date, time } = instantToZonedTime(new Date(instant), timeZone)
  return `${date}T${time}`
}

/** An instant from a `datetime-local` value; `null` for an empty or partial one. */
export function fromLocalInput(value: string, timeZone: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value)
  if (!match) return null
  return zonedTimeToInstant(match[1]!, match[2]!, timeZone).toISOString()
}

/** A reminder as local date and time, e.g. to format it like a due date. */
export function reminderParts(
  instant: string,
  timeZone: string,
): { dueDate: string; dueTime: string } {
  const { date, time } = instantToZonedTime(new Date(instant), timeZone)
  return { dueDate: date, dueTime: time }
}
