import { describe, expect, it } from 'vitest'

import { registerSchema } from './auth.js'
import { accentColorSchema, timezoneSchema, usernameSchema } from './common.js'
import { DEFAULT_PREFERENCES, parsePreferences, updateMeSchema } from './user.js'

describe('usernameSchema', () => {
  it.each(['anna', 'max.mustermann', 'wg_kueche', 'user-42', 'abc'])('accepts %s', (name) => {
    expect(usernameSchema.safeParse(name).success).toBe(true)
  })

  it('normalizes case and surrounding whitespace', () => {
    expect(usernameSchema.parse('  Anna ')).toBe('anna')
  })

  it.each(['ab', '.anna', 'anna.', 'an na', 'änna', 'a'.repeat(33), '-x-'])(
    'rejects %s',
    (name) => {
      expect(usernameSchema.safeParse(name).success).toBe(false)
    },
  )

  it('reports format problems with a translation key', () => {
    const result = usernameSchema.safeParse('bad name')
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      'validation.username_format',
    )
  })
})

describe('timezoneSchema', () => {
  it('accepts IANA zones', () => {
    expect(timezoneSchema.safeParse('Europe/Berlin').success).toBe(true)
    expect(timezoneSchema.safeParse('UTC').success).toBe(true)
  })

  it('rejects unknown zones', () => {
    expect(timezoneSchema.safeParse('Mars/Olympus_Mons').success).toBe(false)
    expect(timezoneSchema.safeParse('').success).toBe(false)
  })
})

describe('accentColorSchema', () => {
  it('accepts presets and hex colors', () => {
    expect(accentColorSchema.parse('teal')).toBe('teal')
    expect(accentColorSchema.parse('#FF9500')).toBe('#ff9500')
  })

  it('rejects other values', () => {
    expect(accentColorSchema.safeParse('#fff').success).toBe(false)
    expect(accentColorSchema.safeParse('magenta').success).toBe(false)
  })
})

describe('parsePreferences', () => {
  it('falls back to defaults for missing or invalid values', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES)
    expect(parsePreferences({ theme: 'sepia', accentColor: 'green', extra: true })).toEqual({
      theme: 'system',
      accentColor: 'green',
    })
  })
})

describe('updateMeSchema', () => {
  it('does not fill in defaults for omitted fields', () => {
    expect(updateMeSchema.parse({ preferences: { theme: 'dark' } })).toEqual({
      preferences: { theme: 'dark' },
    })
  })

  it('allows clearing the email address', () => {
    expect(updateMeSchema.parse({ email: null })).toEqual({ email: null })
  })
})

describe('registerSchema', () => {
  it('normalizes the email address', () => {
    const input = registerSchema.parse({
      username: 'anna',
      displayName: 'Anna',
      email: ' Anna@Example.org ',
      password: 'correct horse battery',
    })
    expect(input.email).toBe('anna@example.org')
  })

  it('enforces the minimum password length', () => {
    const result = registerSchema.safeParse({
      username: 'anna',
      displayName: 'Anna',
      password: 'short',
    })
    expect(result.success).toBe(false)
  })
})
