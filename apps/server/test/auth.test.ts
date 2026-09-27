import type { AuthConfig, Me } from '@crystal/shared'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createInvite,
  createTestContext,
  errorCode,
  PASSWORD,
  registerUser,
  type TestContext,
} from './helpers.js'

let context: TestContext
afterEach(() => context.close())

describe('first-run setup', () => {
  it('reports that setup is needed until the first account exists', async () => {
    context = createTestContext()
    const client = context.client()

    const before = await client.get<AuthConfig>('/api/v1/auth/config')
    expect(before.body).toMatchObject({ needsSetup: true, registration: 'invite' })

    await registerUser(context, 'anna')
    const after = await client.get<AuthConfig>('/api/v1/auth/config')
    expect(after.body.needsSetup).toBe(false)
  })

  it('makes the first account an administrator, even when registration is closed', async () => {
    context = createTestContext({ REGISTRATION: 'closed' })
    const { me } = await registerUser(context, 'anna')
    expect(me.role).toBe('admin')
  })

  it('signs the new account in right away', async () => {
    context = createTestContext()
    const { client } = await registerUser(context, 'anna', {
      locale: 'de',
      timezone: 'Europe/Berlin',
    })
    const me = await client.get<Me>('/api/v1/me')
    expect(me.status).toBe(200)
    expect(me.body).toMatchObject({ username: 'anna', locale: 'de', timezone: 'Europe/Berlin' })
  })
})

describe('registration modes', () => {
  it('invite: rejects registration without a valid invite', async () => {
    context = createTestContext({ REGISTRATION: 'invite' })
    await registerUser(context, 'anna')

    const withoutInvite = await context
      .client()
      .post('/api/v1/auth/register', { username: 'ben', displayName: 'Ben', password: PASSWORD })
    expect(withoutInvite.status).toBe(403)
    expect(errorCode(withoutInvite)).toBe('registration_closed')

    const withBadInvite = await context.client().post('/api/v1/auth/register', {
      username: 'ben',
      displayName: 'Ben',
      password: PASSWORD,
      inviteToken: 'not-a-real-token',
    })
    expect(errorCode(withBadInvite)).toBe('invite_invalid')
  })

  it('invite: accepts a valid invite and assigns its role', async () => {
    context = createTestContext({ REGISTRATION: 'invite' })
    const { client: admin } = await registerUser(context, 'anna')
    const token = await createInvite(admin, { role: 'admin' })

    const preview = await context.client().get(`/api/v1/invites/${token}`)
    expect(preview.status).toBe(200)
    expect(preview.body).toMatchObject({ role: 'admin', invitedBy: 'Anna' })

    const { me } = await registerUser(context, 'ben', { inviteToken: token })
    expect(me.role).toBe('admin')
  })

  it('invite: an invite cannot be used more often than allowed', async () => {
    context = createTestContext()
    const { client: admin } = await registerUser(context, 'anna')
    const token = await createInvite(admin, { maxUses: 1 })

    await registerUser(context, 'ben', { inviteToken: token })
    const second = await context.client().post('/api/v1/auth/register', {
      username: 'carla',
      displayName: 'Carla',
      password: PASSWORD,
      inviteToken: token,
    })
    expect(errorCode(second)).toBe('invite_invalid')
    expect((await context.client().get(`/api/v1/invites/${token}`)).status).toBe(404)
  })

  it('invite: expired and revoked invites are rejected', async () => {
    context = createTestContext()
    const { client: admin } = await registerUser(context, 'anna')
    const expiring = await createInvite(admin, { expiresInDays: 1 })
    context.clock.advance(1000)
    const revoked = await createInvite(admin)

    // Invites are listed newest first, so the first one belongs to `revoked`.
    const invites = await admin.get<{ id: string }[]>('/api/v1/admin/invites')
    const newest = invites.body[0]!
    expect((await admin.delete(`/api/v1/admin/invites/${newest.id}`)).status).toBe(204)

    context.clock.advance(2 * 24 * 60 * 60 * 1000)
    for (const token of [expiring, revoked]) {
      const response = await context.client().post('/api/v1/auth/register', {
        username: 'ben',
        displayName: 'Ben',
        password: PASSWORD,
        inviteToken: token,
      })
      expect(errorCode(response)).toBe('invite_invalid')
    }

    const statuses = (await admin.get<{ status: string }[]>('/api/v1/admin/invites')).body.map(
      (invite) => invite.status,
    )
    expect(statuses.sort()).toEqual(['expired', 'revoked'])
  })

  it('open: anyone may register', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    await registerUser(context, 'anna')
    const { me } = await registerUser(context, 'ben')
    expect(me.role).toBe('user')
  })

  it('closed: nobody may register after setup, not even with an invite', async () => {
    context = createTestContext({ REGISTRATION: 'closed' })
    const { client: admin } = await registerUser(context, 'anna')
    const token = await createInvite(admin)
    const response = await context.client().post('/api/v1/auth/register', {
      username: 'ben',
      displayName: 'Ben',
      password: PASSWORD,
      inviteToken: token,
    })
    expect(errorCode(response)).toBe('registration_closed')
  })

  it('rejects duplicate usernames and email addresses', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    await registerUser(context, 'anna', { email: 'anna@example.org' })

    const sameName = await context
      .client()
      .post('/api/v1/auth/register', { username: 'ANNA', displayName: 'A', password: PASSWORD })
    expect(sameName.status).toBe(409)
    expect(errorCode(sameName)).toBe('username_taken')

    const sameEmail = await context.client().post('/api/v1/auth/register', {
      username: 'anna2',
      displayName: 'A',
      email: 'Anna@Example.org',
      password: PASSWORD,
    })
    expect(errorCode(sameEmail)).toBe('email_taken')
  })

  it('validates input and reports every problem', async () => {
    context = createTestContext()
    const response = await context
      .client()
      .post<{ error: { code: string; details: { path: string }[] } }>('/api/v1/auth/register', {
        username: 'a b',
        displayName: '',
        password: 'short',
      })
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('validation_failed')
    expect(response.body.error.details.map((detail) => detail.path).sort()).toEqual([
      'displayName',
      'password',
      'username',
    ])
  })

  it('rejects malformed JSON', async () => {
    context = createTestContext()
    const response = await context
      .client()
      .request('POST', '/api/v1/auth/register', undefined, { 'content-type': 'application/json' })
    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe('validation_failed')
  })
})

describe('login and logout', () => {
  it('signs in with username or email and signs out again', async () => {
    context = createTestContext()
    await registerUser(context, 'anna', { email: 'anna@example.org' })

    for (const identifier of ['anna', 'ANNA', 'anna@example.org']) {
      const client = context.client()
      const login = await client.post<Me>('/api/v1/auth/login', { identifier, password: PASSWORD })
      expect(login.status).toBe(200)
      expect(login.body.username).toBe('anna')

      expect((await client.post('/api/v1/auth/logout')).status).toBe(204)
      expect((await client.get('/api/v1/me')).status).toBe(401)
    }
  })

  it('does not reveal whether the username or the password was wrong', async () => {
    context = createTestContext()
    await registerUser(context, 'anna')
    const client = context.client()

    const wrongPassword = await client.post('/api/v1/auth/login', {
      identifier: 'anna',
      password: 'wrong password',
    })
    const unknownUser = await client.post('/api/v1/auth/login', {
      identifier: 'nobody',
      password: 'wrong password',
    })
    expect(wrongPassword.status).toBe(401)
    expect(unknownUser.status).toBe(401)
    expect(wrongPassword.body).toEqual(unknownUser.body)
  })

  it('replaces an existing session on login', async () => {
    context = createTestContext()
    const { client } = await registerUser(context, 'anna')
    const firstToken = [...client.cookies.values()][0]

    await client.post('/api/v1/auth/login', { identifier: 'anna', password: PASSWORD })
    const sessions = await client.get<unknown[]>('/api/v1/me/sessions')
    expect(sessions.body).toHaveLength(1)
    expect([...client.cookies.values()][0]).not.toBe(firstToken)
  })

  it('blocks disabled accounts', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const { client: admin } = await registerUser(context, 'anna')
    const { me: ben } = await registerUser(context, 'ben')
    await admin.patch(`/api/v1/admin/users/${ben.id}`, { disabled: true })

    const login = await context
      .client()
      .post('/api/v1/auth/login', { identifier: 'ben', password: PASSWORD })
    expect(login.status).toBe(403)
    expect(errorCode(login)).toBe('account_disabled')
  })

  it('refuses password sign-in and registration when it is disabled', async () => {
    context = createTestContext({
      PASSWORD_LOGIN: 'false',
      OIDC_ISSUER: 'https://id.example.org',
      OIDC_CLIENT_ID: 'crystal',
    })
    const client = context.client()
    const config = await client.get<AuthConfig>('/api/v1/auth/config')
    expect(config.body).toMatchObject({
      passwordLogin: false,
      oidc: { enabled: true, buttonLabel: 'SSO' },
    })

    const register = await client.post('/api/v1/auth/register', {
      username: 'anna',
      displayName: 'Anna',
      password: PASSWORD,
    })
    expect(errorCode(register)).toBe('password_login_disabled')
  })
})
