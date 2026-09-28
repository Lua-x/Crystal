import { afterEach, describe, expect, it } from 'vitest'

import { sessions } from '../src/db/schema.js'
import {
  createTestContext,
  errorCode,
  PASSWORD,
  registerUser,
  type TestContext,
} from './helpers.js'

let context: TestContext
afterEach(() => context.close())

describe('CSRF protection', () => {
  it('rejects state-changing requests from other origins or without an origin', async () => {
    context = createTestContext()
    const body = { username: 'anna', displayName: 'Anna', password: PASSWORD }

    const foreign = await context
      .client({ origin: 'https://evil.example' })
      .post('/api/v1/auth/register', body)
    expect(foreign.status).toBe(403)
    expect(errorCode(foreign)).toBe('csrf_failed')

    const missing = await context.client({ origin: null }).post('/api/v1/auth/register', body)
    expect(errorCode(missing)).toBe('csrf_failed')

    const sameOrigin = await context
      .client({ origin: null })
      .post('/api/v1/auth/register', body, { 'sec-fetch-site': 'same-origin' })
    expect(sameOrigin.status).toBe(201)
  })

  it('protects authenticated requests too', async () => {
    context = createTestContext()
    const { client } = await registerUser(context, 'anna')
    const response = await client.patch('/api/v1/me', { displayName: 'x' })
    expect(response.status).toBe(200)

    const cookie = [...client.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    const forged = await context.app.request('http://crystal.test/api/v1/me', {
      method: 'PATCH',
      headers: { cookie, origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Hacked' }),
    })
    expect(forged.status).toBe(403)
  })

  it('compares with the Host header when BASE_URL is not set', async () => {
    context = createTestContext({ BASE_URL: '' })
    const response = await context.app.request('http://crystal.test/api/v1/auth/logout', {
      method: 'POST',
      headers: { origin: 'http://crystal.test', host: 'crystal.test' },
    })
    expect(response.status).toBe(204)

    const foreign = await context.app.request('http://crystal.test/api/v1/auth/logout', {
      method: 'POST',
      headers: { origin: 'http://other.test', host: 'crystal.test' },
    })
    expect(foreign.status).toBe(403)
  })

  it('allows safe methods without an origin', async () => {
    context = createTestContext()
    expect((await context.client({ origin: null }).get('/api/v1/auth/config')).status).toBe(200)
  })
})

describe('security headers', () => {
  it('sends a strict content security policy and no-store for API responses', async () => {
    context = createTestContext()
    const response = await context.client().get('/api/v1/auth/config')
    const csp = response.headers.get('content-security-policy') ?? ''
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('strict-transport-security')).toBeNull()
  })

  it('sends HSTS only when enabled and served over HTTPS', async () => {
    context = createTestContext({ BASE_URL: 'https://crystal.test', HSTS: 'true' })
    const response = await context.app.request('https://crystal.test/api/v1/auth/config')
    expect(response.headers.get('strict-transport-security')).toContain('max-age=31536000')
  })
})

describe('session cookie', () => {
  it('is HttpOnly and SameSite=Lax, without Secure on plain HTTP', async () => {
    context = createTestContext()
    const response = await context.client().post('/api/v1/auth/register', {
      username: 'anna',
      displayName: 'Anna',
      password: PASSWORD,
    })
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/^crystal_session=/)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toContain('Secure')
  })

  it('uses a __Host- cookie with Secure over HTTPS', async () => {
    context = createTestContext({ BASE_URL: 'https://crystal.test' })
    const response = await context.app.request('https://crystal.test/api/v1/auth/register', {
      method: 'POST',
      headers: { origin: 'https://crystal.test', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'anna', displayName: 'Anna', password: PASSWORD }),
    })
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/^__Host-crystal_session=/)
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('Path=/')
  })

  it('stores only a hash of the session token', async () => {
    context = createTestContext()
    const { client } = await registerUser(context, 'anna')
    const token = client.cookies.get('crystal_session')!
    const rows = context.services.db.select().from(sessions).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.tokenHash).not.toBe(token)
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('rate limiting', () => {
  it('limits failed sign-in attempts per account and address', async () => {
    context = createTestContext()
    await registerUser(context, 'anna')
    const attacker = context.client({ ip: '198.51.100.7' })

    const statuses: number[] = []
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await attacker.post('/api/v1/auth/login', {
        identifier: 'anna',
        password: `guess-${attempt}`,
      })
      statuses.push(response.status)
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true)
    expect(statuses.slice(10)).toEqual([429, 429])

    const limited = await attacker.post('/api/v1/auth/login', {
      identifier: 'anna',
      password: PASSWORD,
    })
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/)

    // Another address is not affected.
    const owner = await context
      .client({ ip: '203.0.113.99' })
      .post('/api/v1/auth/login', { identifier: 'anna', password: PASSWORD })
    expect(owner.status).toBe(200)

    // The limit resets after the window.
    context.clock.advance(16 * 60 * 1000)
    const later = await attacker.post('/api/v1/auth/login', {
      identifier: 'anna',
      password: PASSWORD,
    })
    expect(later.status).toBe(200)
  })

  it('does not count successful sign-ins against the account', async () => {
    context = createTestContext()
    await registerUser(context, 'anna')
    const device = context.client({ ip: '198.51.100.8' })

    for (let round = 0; round < 3; round++) {
      // Nine typos, then the right password: never limited, because a
      // successful sign-in starts the count over.
      for (let attempt = 0; attempt < 9; attempt++) {
        const typo = await device.post('/api/v1/auth/login', {
          identifier: 'anna',
          password: `typo-${attempt}`,
        })
        expect(typo.status).toBe(401)
      }
      const success = await device.post('/api/v1/auth/login', {
        identifier: 'anna',
        password: PASSWORD,
      })
      expect(success.status).toBe(200)
    }
  })
})

describe('unknown routes', () => {
  it('answers API 404s with JSON', async () => {
    context = createTestContext()
    const response = await context.client().get('/api/v1/does-not-exist')
    expect(response.status).toBe(404)
    expect(errorCode(response)).toBe('not_found')
  })

  it('serves a health check and the OpenAPI document', async () => {
    context = createTestContext()
    const health = await context.client().get('/api/health')
    expect(health.body).toEqual({ status: 'ok', version: 'test', database: 'ok' })

    const spec = await context.client().get<{ paths: Record<string, unknown> }>('/api/openapi.json')
    expect(Object.keys(spec.body.paths)).toEqual(
      expect.arrayContaining(['/api/health', '/api/v1/auth/login', '/api/v1/admin/users/{id}']),
    )
  })
})
