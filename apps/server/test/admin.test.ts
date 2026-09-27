import type { AdminUser, CreatedInvite, Invite } from '@crystal/shared'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createTestContext,
  errorCode,
  PASSWORD,
  registerUser,
  type TestClient,
  type TestContext,
} from './helpers.js'

let context: TestContext
afterEach(() => context.close())

async function setup() {
  context = createTestContext({ REGISTRATION: 'open' })
  const anna = await registerUser(context, 'anna')
  const ben = await registerUser(context, 'ben')
  return { admin: anna.client, adminId: anna.me.id, user: ben.client, userId: ben.me.id }
}

async function findUser(admin: TestClient, id: string) {
  const users = await admin.get<AdminUser[]>('/api/v1/admin/users')
  return users.body.find((user) => user.id === id)
}

describe('access control', () => {
  it('is limited to administrators', async () => {
    const { user } = await setup()
    for (const path of ['/api/v1/admin/users', '/api/v1/admin/invites']) {
      const response = await user.get(path)
      expect(response.status).toBe(403)
      expect(errorCode(response)).toBe('forbidden')
    }
    expect((await context.client().get('/api/v1/admin/users')).status).toBe(401)
  })
})

describe('user management', () => {
  it('lists accounts', async () => {
    const { admin } = await setup()
    const users = await admin.get<AdminUser[]>('/api/v1/admin/users')
    expect(users.body.map((user) => [user.username, user.role])).toEqual([
      ['anna', 'admin'],
      ['ben', 'user'],
    ])
    expect(users.body[0]).not.toHaveProperty('passwordHash')
  })

  it('promotes and demotes', async () => {
    const { admin, userId } = await setup()
    const promoted = await admin.patch<AdminUser>(`/api/v1/admin/users/${userId}`, {
      role: 'admin',
    })
    expect(promoted.body.role).toBe('admin')
    const demoted = await admin.patch<AdminUser>(`/api/v1/admin/users/${userId}`, { role: 'user' })
    expect(demoted.body.role).toBe('user')
  })

  it('disabling an account signs it out immediately', async () => {
    const { admin, user, userId } = await setup()
    await admin.patch(`/api/v1/admin/users/${userId}`, { disabled: true })
    expect((await user.get('/api/v1/me')).status).toBe(401)
    expect((await findUser(admin, userId))?.disabled).toBe(true)

    await admin.patch(`/api/v1/admin/users/${userId}`, { disabled: false })
    const login = await context
      .client()
      .post('/api/v1/auth/login', { identifier: 'ben', password: PASSWORD })
    expect(login.status).toBe(200)
  })

  it('resets a password and signs the user out', async () => {
    const { admin, user, userId } = await setup()
    await admin.patch(`/api/v1/admin/users/${userId}`, { password: 'reset by the admin' })
    expect((await user.get('/api/v1/me')).status).toBe(401)
    const login = await context
      .client()
      .post('/api/v1/auth/login', { identifier: 'ben', password: 'reset by the admin' })
    expect(login.status).toBe(200)
  })

  it('never leaves the instance without an active administrator', async () => {
    const { admin, adminId, user, userId } = await setup()

    // Admins cannot demote, disable or delete themselves.
    for (const response of [
      await admin.patch(`/api/v1/admin/users/${adminId}`, { role: 'user' }),
      await admin.patch(`/api/v1/admin/users/${adminId}`, { disabled: true }),
      await admin.delete(`/api/v1/admin/users/${adminId}`),
    ]) {
      expect(errorCode(response)).toBe('cannot_modify_self')
    }

    // Through the API the acting admin always counts as another active admin, so the
    // last-admin guard is checked on the service with an actor that has since been disabled.
    await admin.patch(`/api/v1/admin/users/${userId}`, { role: 'admin' })
    await user.patch(`/api/v1/admin/users/${adminId}`, { disabled: true })
    const lastAdmin = await context.services.admin
      .updateUser(context.services.users.findById(adminId)!, userId, { role: 'user' })
      .then(() => 'updated')
      .catch((error: { code?: string }) => error.code)
    expect(lastAdmin).toBe('last_admin')
  })

  it('deletes accounts', async () => {
    const { admin, user, userId } = await setup()
    expect((await admin.delete(`/api/v1/admin/users/${userId}`)).status).toBe(204)
    expect(await findUser(admin, userId)).toBeUndefined()
    expect((await user.get('/api/v1/me')).status).toBe(401)
    expect((await admin.delete(`/api/v1/admin/users/${userId}`)).status).toBe(404)
  })
})

describe('invites', () => {
  it('returns the token only once and never lists it', async () => {
    const { admin } = await setup()
    const created = await admin.post<CreatedInvite>('/api/v1/admin/invites', {
      role: 'user',
      maxUses: 3,
      expiresInDays: null,
      note: 'For the flat',
    })
    expect(created.status).toBe(201)
    expect(created.body.token).toMatch(/^[\w-]{43}$/)
    expect(created.body).toMatchObject({ maxUses: 3, uses: 0, expiresAt: null, status: 'active' })

    const list = await admin.get<Invite[]>('/api/v1/admin/invites')
    expect(list.body).toHaveLength(1)
    expect(list.body[0]).not.toHaveProperty('token')
    expect(list.body[0]).toMatchObject({ note: 'For the flat', createdBy: 'Anna' })
  })

  it('validates limits', async () => {
    const { admin } = await setup()
    const response = await admin.post('/api/v1/admin/invites', {
      role: 'user',
      maxUses: 0,
      expiresInDays: 365,
    })
    expect(response.status).toBe(400)
  })
})
