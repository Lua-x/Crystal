/** Whether the runtime knows the given IANA time zone (e.g. `Europe/Berlin`). */
export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.length === 0) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function partsIn(instant: Date, timeZone: string) {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }
  const parts = formatter.formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/** How far the time zone is ahead of UTC at `instant`, in minutes. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const local = partsIn(instant, timeZone)
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  )
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000)
}

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * The instant at which it is `date` `time` (`YYYY-MM-DD`, `HH:MM`) in the
 * time zone. Times that do not exist because the clocks jump forward land
 * just after the jump; times that exist twice resolve to the first.
 */
export function zonedTimeToInstant(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const [hours, minutes] = time.split(':').map(Number) as [number, number]
  const wall = Date.UTC(year, month - 1, day, hours, minutes)
  // Clocks change at most once around a given day, so the offsets a day before
  // and a day after give every instant that can show this wall time.
  const candidates = [-1, 1].map(
    (days) => wall - offsetMinutes(new Date(wall + days * 86_400_000), timeZone) * 60_000,
  )
  const exact = candidates.filter((candidate) => {
    const local = partsIn(new Date(candidate), timeZone)
    return (
      local.year === year &&
      local.month === month &&
      local.day === day &&
      local.hour === hours &&
      local.minute === minutes
    )
  })
  return new Date(exact.length > 0 ? Math.min(...exact) : Math.max(...candidates))
}

/** The local date and time (`YYYY-MM-DD`, `HH:MM`) of an instant in the time zone. */
export function instantToZonedTime(
  instant: Date,
  timeZone: string,
): { date: string; time: string } {
  const local = partsIn(instant, timeZone)
  return {
    date: `${String(local.year).padStart(4, '0')}-${pad(local.month)}-${pad(local.day)}`,
    time: `${pad(local.hour)}:${pad(local.minute)}`,
  }
}
