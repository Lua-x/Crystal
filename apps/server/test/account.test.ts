import type { Me, SessionInfo } from '@crystal/shared'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createTestContext,
  errorCode,
  PASSWORD,
  registerUser,
  type TestContext,
} from './helpers.js'

let context: TestContext
afterEach(() => context.close())

const DAY_MS = 24 * 60 * 60 * 1000

describe('profile', () => {
  it('requires a session', async () => {
    context = createTestContext()
    const response = await context.client().get('/api/v1/me')
    expect(response.status).toBe(401)
    expect(errorCode(response)).toBe('unauthorized')
  })

  it('updates profile fields and merges preferences', async () => {
    context = createTestContext()
    const { client } = await registerUser(context, 'anna')

    const first = await client.patch<Me>('/api/v1/me', {
      displayName: 'Anna Schmidt',
      email: 'anna@example.org',
      locale: 'de',
      timezone: 'Europe/Berlin',
      preferences: { theme: 'dark' },
    })
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({
      displayName: 'Anna Schmidt',
      email: 'anna@example.org',
      locale: 'de',
      timezone: 'Europe/Berlin',
      preferences: { theme: 'dark', accentColor: 'blue' },
    })

    const second = await client.patch<Me>('/api/v1/me', {
      email: null,
      preferences: { accentColor: '#34C759', smartEntry: false },
    })
    expect(second.body.email).toBeNull()
    expect(second.body.preferences).toEqual({
      theme: 'dark',
      accentColor: '#34c759',
      smartEntry: false,
    })
  })

  it('rejects an unknown time zone and a taken username', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    await registerUser(context, 'ben')
    const { client } = await registerUser(context, 'anna')

    expect((await client.patch('/api/v1/me', { timezone: 'Nowhere/Land' })).status).toBe(400)
    const taken = await client.patch('/api/v1/me', { username: 'ben' })
    expect(errorCode(taken)).toBe('username_taken')
  })
})

describe('password', () => {
  it('requires the current password and signs out other sessions', async () => {
    context = createTestContext()
    const { client } = await registerUser(context, 'anna')
    const otherDevice = context.client()
    await otherDevice.post('/api/v1/auth/login', { identifier: 'anna', password: PASSWORD })

    const wrong = await client.post('/api/v1/me/password', {
      currentPassword: 'not it',
      newPassword: 'a whole new password',
    })
    expect(errorCode(wrong)).toBe('wrong_password')

    const missing = await client.post('/api/v1/me/password', {
      newPassword: 'a whole new password',
    })
    expect(errorCode(missing)).toBe('wrong_password')

    const changed = await client.post('/api/v1/me/password', {
      currentPassword: PASSWORD,
      newPassword: 'a whole new password',
    })
    expect(changed.status).toBe(204)
    expect((await client.get('/api/v1/me')).status).toBe(200)
    expect((await otherDevice.get('/api/v1/me')).status).toBe(401)

    const relogin = await context
      .client()
      .post('/api/v1/auth/login', { identifier: 'anna', password: 'a whole new password' })
    expect(relogin.status).toBe(200)
  })
})

describe('sessions', () => {
  it('lists devices and signs out a single one or all others', async () => {
    context = createTestContext()
    const { client } = await registerUser(context, 'anna')
    const phone = context.client()
    await phone.post(
      '/api/v1/auth/login',
      { identifier: 'anna', password: PASSWORD },
      { 'user-agent': 'Phone' },
    )
    const tablet = context.client()
    await tablet.post('/api/v1/auth/login', { identifier: 'anna', password: PASSWORD })

    const list = await client.get<SessionInfo[]>('/api/v1/me/sessions')
    expect(list.body).toHaveLength(3)
    expect(list.body.filter((session) => session.current)).toHaveLength(1)

    const phoneSession = list.body.find((session) => session.userAgent === 'Phone')!
    expect((await client.delete(`/api/v1/me/sessions/${phoneSession.id}`)).status).toBe(204)
    expect((await phone.get('/api/v1/me')).status).toBe(401)
    expect((await tablet.get('/api/v1/me')).status).toBe(200)

    expect((await client.delete('/api/v1/me/sessions')).status).toBe(204)
    expect((await tablet.get('/api/v1/me')).status).toBe(401)
    expect((await client.get('/api/v1/me')).status).toBe(200)
  })

  it('cannot sign out sessions of other users', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const { client: anna } = await registerUser(context, 'anna')
    const { client: ben } = await registerUser(context, 'ben')
    const annaSession = (await anna.get<SessionInfo[]>('/api/v1/me/sessions')).body[0]!

    expect((await ben.delete(`/api/v1/me/sessions/${annaSession.id}`)).status).toBe(404)
    expect((await anna.get('/api/v1/me')).status).toBe(200)
  })

  it('expires after the configured lifetime without activity', async () => {
    context = createTestContext({ SESSION_TTL_DAYS: '30' })
    const { client } = await registerUser(context, 'anna')

    context.clock.advance(31 * DAY_MS)
    expect((await client.get('/api/v1/me')).status).toBe(401)
  })

  it('slides the expiry forward while the user is active', async () => {
    context = createTestContext({ SESSION_TTL_DAYS: '30' })
    const { client } = await registerUser(context, 'anna')

    // Active every 20 days: the session must outlive its original 30 days.
    for (let round = 0; round < 3; round++) {
      context.clock.advance(20 * DAY_MS)
      const response = await client.get('/api/v1/me')
      expect(response.status).toBe(200)
    }
  })
})
