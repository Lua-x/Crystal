import { describe, expect, it } from 'vitest'

import { suggestUsername } from '../features/auth/suggest-username'
import { safeRedirect } from './errors'
import { describeUserAgent, formatRelative } from './format'
import { detectLocale } from './i18n'

describe('safeRedirect', () => {
  it.each([
    ['/settings/account', '/settings/account'],
    ['/?x=1', '/?x=1'],
    [undefined, '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected)
  })
})

describe('suggestUsername', () => {
  it.each([
    ['Anna Müller', 'anna.muller'],
    ['  Jürgen  ', 'jurgen'],
    ['WG Küche!', 'wg.kuche'],
    ['.hidden.', 'hidden'],
  ])('%s → %s', (name, expected) => {
    expect(suggestUsername(name)).toBe(expected)
  })
})

describe('describeUserAgent', () => {
  it('recognizes common browsers and systems', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',
      ),
    ).toEqual({ browser: 'Edge', os: 'Windows', kind: 'desktop' })
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ browser: 'Safari', os: 'iOS', kind: 'phone' })
    expect(
      describeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'),
    ).toEqual({
      browser: 'Firefox',
      os: 'Linux',
      kind: 'desktop',
    })
  })

  it('copes with a missing user agent', () => {
    expect(describeUserAgent(null)).toEqual({ browser: undefined, os: undefined, kind: 'desktop' })
  })
})

describe('formatRelative', () => {
  const now = new Date('2026-09-27T12:00:00Z')

  it('formats past times in the given language', () => {
    expect(formatRelative('2026-09-27T11:57:00Z', 'en', now)).toBe('3 minutes ago')
    expect(formatRelative('2026-09-26T12:00:00Z', 'de', now)).toBe('gestern')
  })

  it('says "now" for the last minute', () => {
    expect(formatRelative('2026-09-27T11:59:40Z', 'en', now)).toBe('now')
  })
})

describe('detectLocale', () => {
  it('picks the first supported language', () => {
    expect(detectLocale(['fr-FR', 'de-AT', 'en'])).toBe('de')
    expect(detectLocale(['en-GB'])).toBe('en')
    expect(detectLocale(['fr'])).toBe('en')
  })
})
