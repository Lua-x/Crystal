import type { ApiToken, CreatedApiToken, List, Me, Task } from '@crystal/shared'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createTestContext,
  errorCode,
  registerUser,
  type TestClient,
  type TestContext,
} from './helpers.js'

let context: TestContext
afterEach(() => context.close())

async function createToken(client: TestClient, input: Record<string, unknown> = {}) {
  const response = await client.post<CreatedApiToken>('/api/v1/me/tokens', {
    name: 'Home Assistant',
    scope: 'write',
    expiresInDays: null,
    ...input,
  })
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body
}

/** A client without cookies or Origin, like a script. */
function script(token: string) {
  const client = context.client({ origin: null, ip: '198.51.100.7' })
  const headers = { authorization: `Bearer ${token}` }
  return {
    get: <T>(path: string) => client.get<T>(path, headers),
    post: <T>(path: string, body?: unknown) => client.post<T>(path, body, headers),
    patch: <T>(path: string, body?: unknown) => client.patch<T>(path, body, headers),
  }
}

describe('personal API tokens', () => {
  it('are shown once, listed without the secret and work without cookies or Origin', async () => {
    context = createTestContext()
    const { client } = await registerUser(context, 'anna')
    const created = await createToken(client)
    expect(created.token).toMatch(/^crystal_[\w-]{43}$/)
    expect(created).toMatchObject({ name: 'Home Assistant', scope: 'write', expiresAt: null })
    expect(created.token.startsWith(created.hint)).toBe(true)

    const listed = (await client.get<ApiToken[]>('/api/v1/me/tokens')).body
    expect(listed).toHaveLength(1)
    expect(listed[0]).not.toHaveProperty('token')
    expect(listed[0]!.lastUsedAt).toBeNull()

    const api = script(created.token)
    const lists = await api.get<List[]>('/api/v1/lists')
    expect(lists.status).toBe(200)
    const task = await api.post<Task>('/api/v1/tasks', { title: 'From a script' })
    expect(task.status).toBe(201)
    expect((await api.get<Me>('/api/v1/me')).body.username).toBe('anna')

    const used = (await client.get<ApiToken[]>('/api/v1/me/tokens')).body[0]!
    expect(used.lastUsedAt).toBe(context.clock.now().toISOString())
  })

  it('keeps tokens away from account settings and administration', async () => {
    context = createTestContext()
    // The first account is an administrator.
    const { client } = await registerUser(context, 'anna')
    const { token } = await createToken(client)
    const api = script(token)

    for (const response of [
      await api.get('/api/v1/me/sessions'),
      await api.get('/api/v1/me/tokens'),
      await api.post('/api/v1/me/tokens', { name: 'x', scope: 'write', expiresInDays: null }),
      await api.patch('/api/v1/me', { displayName: 'Mallory' }),
      await api.post('/api/v1/me/password', { newPassword: 'a whole new password' }),
      await api.get('/api/v1/admin/users'),
      await api.get('/api/v1/notifications/channels'),
      await api.post('/api/v1/auth/logout'),
    ]) {
      expect(response.status).toBe(403)
      expect(errorCode(response)).toBe('token_not_allowed')
    }
  })

  it('lets read-only tokens only read', async () => {
    context = createTestContext()
    const { client } = await registerUser(context, 'anna')
    const { token } = await createToken(client, { scope: 'read' })
    const api = script(token)
    expect((await api.get('/api/v1/views/all')).status).toBe(200)
    const write = await api.post('/api/v1/tasks', { title: 'Nope' })
    expect(write.status).toBe(403)
    expect(errorCode(write)).toBe('token_not_allowed')
  })

  it('rejects wrong, revoked and expired tokens and never falls back to the cookie', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna')

    expect((await script('crystal_wrong').get('/api/v1/lists')).status).toBe(401)
    // A signed-in browser that sends a broken Authorization header is not signed in.
    const withCookie = await anna.client.get('/api/v1/lists', { authorization: 'Basic abc' })
    expect(withCookie.status).toBe(401)

    const shortLived = await createToken(anna.client, { expiresInDays: 1 })
    expect((await script(shortLived.token).get('/api/v1/lists')).status).toBe(200)
    context.clock.advance(24 * 60 * 60 * 1000)
    expect((await script(shortLived.token).get('/api/v1/lists')).status).toBe(401)

    const revoked = await createToken(anna.client)
    expect((await anna.client.delete(`/api/v1/me/tokens/${revoked.id}`)).status).toBe(204)
    expect((await script(revoked.token).get('/api/v1/lists')).status).toBe(401)

    // Someone else cannot revoke Anna's tokens.
    const ben = await registerUser(context, 'ben', {}, { ip: '203.0.113.20' })
    const annas = await createToken(anna.client)
    expect((await ben.client.delete(`/api/v1/me/tokens/${annas.id}`)).status).toBe(404)
  })

  it('stop working when the account is disabled', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const admin = await registerUser(context, 'anna')
    const ben = await registerUser(context, 'ben', {}, { ip: '203.0.113.20' })
    const { token } = await createToken(ben.client)
    await admin.client.patch(`/api/v1/admin/users/${ben.me.id}`, { disabled: true })
    expect((await script(token).get('/api/v1/lists')).status).toBe(401)
  })

  it('validates the input and limits the number of tokens', async () => {
    context = createTestContext()
    const { client } = await registerUser(context, 'anna')
    const invalid = await client.post('/api/v1/me/tokens', {
      name: '',
      scope: 'admin',
      expiresInDays: 1000,
    })
    expect(errorCode(invalid)).toBe('validation_failed')
    for (let index = 0; index < 25; index++) await createToken(client, { name: `Token ${index}` })
    const tooMany = await client.post('/api/v1/me/tokens', {
      name: 'One more',
      scope: 'read',
      expiresInDays: null,
    })
    expect(errorCode(tooMany)).toBe('validation_failed')
  })
})

describe('API documentation', () => {
  it('serves Swagger UI from the instance itself', async () => {
    context = createTestContext()
    const client = context.client()
    const page = await client.get<string>('/api/docs')
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toContain('text/html')
    expect(page.body).toContain('/api/docs/swagger-ui-bundle.js')
    expect(page.body).not.toMatch(/<script>(?!<\/script>)/)
    expect(page.headers.get('content-security-policy')).toContain("script-src 'self'")

    const bundle = await client.get<string>('/api/docs/swagger-ui-bundle.js')
    expect(bundle.status).toBe(200)
    expect(bundle.headers.get('content-type')).toContain('javascript')
    expect((await client.get('/api/docs/docs.js')).status).toBe(200)
    expect((await client.get('/api/docs/swagger-ui.css')).status).toBe(200)
    expect((await client.get('/api/docs/package.json')).status).toBe(404)
    expect((await client.get('/api/docs/..%2Fpackage.json')).status).toBe(404)
  })

  it('describes token authentication in the OpenAPI document', async () => {
    context = createTestContext()
    const document = (
      await context.client().get<{
        components: { securitySchemes: Record<string, { type: string; scheme?: string }> }
        paths: Record<string, Record<string, { security?: unknown[] }>>
      }>('/api/openapi.json')
    ).body
    expect(document.components.securitySchemes.token).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    })
    expect(document.paths['/api/v1/tasks']!.post!.security).toEqual([
      { session: [] },
      { token: [] },
    ])
    expect(document.paths['/api/v1/me/tokens']!.post!.security).toEqual([{ session: [] }])
  })
})
