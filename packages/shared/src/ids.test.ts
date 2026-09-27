import { describe, expect, it } from 'vitest'

import { uuidv7, uuidv7Timestamp } from './ids.js'
import { idSchema } from './schemas/common.js'

describe('uuidv7', () => {
  it('produces RFC 9562 version 7 identifiers', () => {
    const id = uuidv7()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(idSchema.safeParse(id).success).toBe(true)
  })

  it('encodes the timestamp in the first 48 bits', () => {
    const timestamp = Date.UTC(2026, 8, 27, 12, 30, 15, 123)
    expect(uuidv7Timestamp(uuidv7(timestamp))).toBe(timestamp)
  })

  it('handles timestamps that need the full 48 bits', () => {
    const timestamp = 2 ** 48 - 1
    expect(uuidv7(timestamp).startsWith('ffffffff-ffff-7')).toBe(true)
  })

  it('sorts lexicographically by creation time', () => {
    const earlier = uuidv7(1_700_000_000_000)
    const later = uuidv7(1_700_000_000_001)
    expect([later, earlier].sort()).toEqual([earlier, later])
  })

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7(1_700_000_000_000)))
    expect(ids.size).toBe(1000)
  })
})
