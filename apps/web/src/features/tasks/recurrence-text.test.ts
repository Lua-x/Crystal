import { recurrenceInputSchema, type Recurrence } from '@crystal/shared'
import i18next from 'i18next'
import { describe, expect, it } from 'vitest'

import { de } from '../../locales/de'
import { en } from '../../locales/en'
import { describeRecurrence, presetOf, ruleForPreset, weekdayNames } from './recurrence-text'

const i18n = i18next.createInstance()
await i18n.init({
  resources: { en: { translation: en }, de: { translation: de } },
  lng: 'en',
  interpolation: { escapeValue: false },
})

const rule = (input: Partial<Recurrence> & Pick<Recurrence, 'frequency'>) =>
  recurrenceInputSchema.parse(input)

describe('describeRecurrence', () => {
  it.each([
    [rule({ frequency: 'daily' }), 'Every day', 'Jeden Tag'],
    [rule({ frequency: 'daily', interval: 3 }), 'Every 3 days', 'Alle 3 Tage'],
    [rule({ frequency: 'weekly' }), 'Every week', 'Jede Woche'],
    [rule({ frequency: 'weekly', weekdays: [0, 1, 2, 3, 4] }), 'Every weekday', 'Werktags'],
    [
      rule({ frequency: 'weekly', weekdays: [1, 4] }),
      'Every Tuesday and Friday',
      'Jeden Dienstag und Freitag',
    ],
    [
      rule({ frequency: 'weekly', interval: 2, weekdays: [0] }),
      'Every 2 weeks on Monday',
      'Alle 2 Wochen am Montag',
    ],
    [rule({ frequency: 'monthly', interval: 3 }), 'Every 3 months', 'Alle 3 Monate'],
    [rule({ frequency: 'yearly' }), 'Every year', 'Jedes Jahr'],
    [
      rule({ frequency: 'daily', interval: 30, from: 'completion' }),
      'Every 30 days, after completion',
      'Alle 30 Tage, ab Erledigung',
    ],
  ])('%j', (input, english, german) => {
    expect(describeRecurrence(input, i18n.getFixedT('en'), 'en')).toBe(english)
    expect(describeRecurrence(input, i18n.getFixedT('de'), 'de')).toBe(german)
  })
})

describe('presets', () => {
  it('recognizes simple rules and round-trips them', () => {
    for (const preset of ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const) {
      expect(presetOf(ruleForPreset(preset))).toBe(preset)
    }
    expect(presetOf(null)).toBe('none')
    expect(presetOf(rule({ frequency: 'weekly', weekdays: [1] }))).toBe('custom')
    expect(presetOf(rule({ frequency: 'daily', from: 'completion' }))).toBe('custom')
  })

  it('names weekdays from Monday on', () => {
    expect(weekdayNames('en')[0]).toBe('Monday')
    // ICU versions differ in the abbreviation dot.
    expect(weekdayNames('de', 'short')[6]).toMatch(/^So\.?$/)
  })
})
