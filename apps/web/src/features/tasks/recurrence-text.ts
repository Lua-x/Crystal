import type { Recurrence } from '@crystal/shared'
import type { TFunction } from 'i18next'

/** Weekday names in ISO order (Monday first). */
export function weekdayNames(locale: string, style: 'long' | 'short' = 'long'): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' })
  // 28 September 2026 is a Monday.
  return Array.from({ length: 7 }, (_, day) => format.format(new Date(Date.UTC(2026, 8, 28 + day))))
}

const WORKDAYS = '0,1,2,3,4'

/** "Every day", "Every 2 weeks on Monday and Friday", "Jeden Dienstag", … */
export function describeRecurrence(rule: Recurrence, t: TFunction, locale: string): string {
  const count = rule.interval
  let text: string
  if (rule.frequency === 'weekly' && rule.weekdays.length > 0) {
    if (count === 1 && rule.weekdays.join(',') === WORKDAYS) {
      text = t('recurrence.describe.weekdays')
    } else {
      const names = weekdayNames(locale)
      const days = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
        rule.weekdays.map((day) => names[day]!),
      )
      text = t('recurrence.describe.weeklyOn', { count, days })
    }
  } else {
    text = t(`recurrence.describe.${rule.frequency}`, { count })
  }
  return rule.from === 'completion'
    ? t('recurrence.describe.afterCompletion', { rule: text })
    : text
}

export type RecurrencePreset = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'

/** The simple choice a rule corresponds to, or `custom` for anything else. */
export function presetOf(rule: Recurrence | null): RecurrencePreset | 'custom' {
  if (!rule) return 'none'
  if (rule.interval !== 1 || rule.from !== 'due') return 'custom'
  if (rule.frequency === 'weekly') {
    if (rule.weekdays.length === 0) return 'weekly'
    return rule.weekdays.join(',') === WORKDAYS ? 'weekdays' : 'custom'
  }
  return rule.frequency
}

export function ruleForPreset(preset: Exclude<RecurrencePreset, 'none'>): Recurrence {
  return preset === 'weekdays'
    ? { frequency: 'weekly', interval: 1, weekdays: [0, 1, 2, 3, 4], from: 'due' }
    : { frequency: preset, interval: 1, weekdays: [], from: 'due' }
}
