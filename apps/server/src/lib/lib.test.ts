import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { pino } from 'pino'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveClientIp } from './client-ip.js'
import { deriveKey, randomToken, safeEqual, seal, sha256, unseal } from './crypto.js'
import { RateLimiter } from './rate-limit.js'
import { resolveSecretKey } from './secret-key.js'

describe('resolveClientIp', () => {
  it('uses the socket address when no proxy is trusted', () => {
    expect(resolveClientIp('10.0.0.2', '1.2.3.4', 0)).toBe('10.0.0.2')
  })

  it('takes the address added by the trusted proxy', () => {
    expect(resolveClientIp('10.0.0.2', '1.2.3.4', 1)).toBe('1.2.3.4')
  })

  it('ignores addresses a client forged in front of the real one', () => {
    expect(resolveClientIp('10.0.0.2', 'forged, 1.2.3.4', 1)).toBe('1.2.3.4')
  })

  it('walks back over several trusted hops', () => {
    expect(resolveClientIp('10.0.0.3', 'forged, 1.2.3.4, 10.0.0.2', 2)).toBe('1.2.3.4')
  })

  it('unwraps IPv4-mapped IPv6 addresses', () => {
    expect(resolveClientIp('::ffff:192.168.1.5', undefined, 0)).toBe('192.168.1.5')
  })
})

describe('RateLimiter', () => {
  it('allows up to the limit per window and key', () => {
    let now = 0
    const limiter = new RateLimiter(2, 1000, () => now)
    expect(limiter.consume('a').allowed).toBe(true)
    expect(limiter.consume('a').allowed).toBe(true)
    const third = limiter.consume('a')
    expect(third.allowed).toBe(false)
    expect(third.retryAfterMs).toBe(1000)
    expect(limiter.consume('b').allowed).toBe(true)

    now = 1000
    expect(limiter.consume('a').allowed).toBe(true)
  })

  it('can reset a key', () => {
    const limiter = new RateLimiter(1, 1000, () => 0)
    limiter.consume('a')
    limiter.reset('a')
    expect(limiter.consume('a').allowed).toBe(true)
  })
})

describe('crypto helpers', () => {
  it('creates URL-safe tokens with 256 bits of entropy', () => {
    const token = randomToken()
    expect(token).toMatch(/^[\w-]{43}$/)
    expect(randomToken()).not.toBe(token)
  })

  it('hashes with SHA-256', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('compares in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })

  it('seals and unseals, and detects tampering or a wrong key', () => {
    const key = deriveKey('secret', 'test')
    const sealed = seal('hello', key)
    expect(unseal(sealed, key)).toBe('hello')
    expect(unseal(sealed, deriveKey('secret', 'other purpose'))).toBeNull()

    const bytes = Buffer.from(sealed, 'base64url')
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1
    expect(unseal(bytes.toString('base64url'), key)).toBeNull()
    expect(unseal('garbage', key)).toBeNull()
  })
})

describe('resolveSecretKey', () => {
  const logger = pino({ level: 'silent' })
  let dir: string | undefined
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('prefers the environment', () => {
    dir = mkdtempSync(join(tmpdir(), 'crystal-'))
    expect(resolveSecretKey(dir, 'from-env', logger)).toBe('from-env')
  })

  it('generates a key once and reuses it', () => {
    dir = mkdtempSync(join(tmpdir(), 'crystal-'))
    const first = resolveSecretKey(dir, undefined, logger)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(resolveSecretKey(dir, undefined, logger)).toBe(first)
    expect(readFileSync(join(dir, 'secret.key'), 'utf8').trim()).toBe(first)
    if (process.platform !== 'win32') {
      expect(statSync(join(dir, 'secret.key')).mode & 0o777).toBe(0o600)
    }
  })
})
