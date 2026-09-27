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
