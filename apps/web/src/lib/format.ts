const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
]

/** "vor 3 Minuten" / "3 minutes ago", or "just now" for the last minute. */
export function formatRelative(date: string | Date, locale: string, now = new Date()): string {
  const seconds = (new Date(date).getTime() - now.getTime()) / 1000
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  }
  return format.format(0, 'second')
}

export function formatDate(date: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(date))
}

export function formatLongDate(date: Date, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(date)
}

export interface DeviceInfo {
  browser: string | undefined
  os: string | undefined
  kind: 'phone' | 'tablet' | 'desktop'
}

/** A rough, dependency-free reading of a user agent for the device list. */
export function describeUserAgent(userAgent: string | null): DeviceInfo {
  const ua = userAgent ?? ''
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : undefined
  const os = /iPhone|iPad|iPod/.test(ua)
    ? /iPad/.test(ua)
      ? 'iPadOS'
      : 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : undefined
  const kind = /iPad|Tablet/.test(ua)
    ? 'tablet'
    : /Mobi|iPhone|Android/.test(ua)
      ? 'phone'
      : 'desktop'
  return { browser, os, kind }
}

/** The time zone of this device, e.g. `Europe/Berlin`. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
