import { describe, expect, it } from 'vitest'

import { deriveUsername } from './auth.js'

describe('deriveUsername', () => {
  it.each([
    [{ preferredUsername: 'Anna.Schmidt' }, 'anna.schmidt'],
    [{ preferredUsername: 'Jürgen Müller' }, 'jurgen-muller'],
    [{ email: 'max+todo@example.org' }, 'max-todo'],
    [{ preferredUsername: '__x__' }, 'user-x'],
    [{}, 'user'],
    [{ preferredUsername: 'a'.repeat(40) }, 'a'.repeat(32)],
  ])('%j becomes %s', (claims, expected) => {
    expect(deriveUsername(claims)).toBe(expected)
  })
})
