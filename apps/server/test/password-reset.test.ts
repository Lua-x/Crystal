import type { AuthConfig } from '@crystal/shared'
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

const NEW_PASSWORD = 'a much better passphrase'

async function setup() {
  context = createTestContext({ REGISTRATION: 'open' }, { mailer: true })
  const anna = await registerUser(context, 'anna', { email: 'anna@example.com' })
  return anna
}

/** Requests a reset and returns the token from the email. */
async function requestReset(identifier: string) {
  const client = context.client({ ip: '203.0.113.99' })
  const response = await client.post('/api/v1/auth/forgot-password', { identifier })
  expect(response.status).toBe(204)
  await context.services.notifications.idle()
  const mail = context.mailer!.sent.at(-1)
  return mail?.text.match(/reset-password\?token=([\w-]+)/)?.[1]
}

describe('password reset', () => {
  it('is only offered when email and a public URL are configured', async () => {
    context = createTestContext()
    const config = await context.client().get<AuthConfig>('/api/v1/auth/config')
    expect(config.body.passwordReset).toBe(false)
    const response = await context
      .client()
      .post('/api/v1/auth/forgot-password', { identifier: 'anna' })
    expect(errorCode(response)).toBe('email_not_configured')
    await context.close()

    context = createTestContext({}, { mailer: true })
    expect((await context.client().get<AuthConfig>('/api/v1/auth/config')).body.passwordReset).toBe(
      true,
    )
  })

  it('emails a link that sets a new password once and signs out everywhere', async () => {
    const anna = await setup()
    const token = await requestReset('anna@example.com')
    expect(context.mailer!.sent).toEqual([
      expect.objectContaining({
        to: 'anna@example.com',
        subject: 'Reset your Crystal password',
      }),
    ])
    expect(context.mailer!.sent[0]!.text).toContain('http://crystal.test/reset-password?token=')
    expect(token).toBeTruthy()

    const tooShort = await context
      .client()
      .post('/api/v1/auth/reset-password', { token, password: 'short' })
    expect(tooShort.status).toBe(400)

    const reset = await context
      .client()
      .post('/api/v1/auth/reset-password', { token, password: NEW_PASSWORD })
    expect(reset.status).toBe(204)

    // The old session is gone, the old password no longer works, the new one does.
    expect((await anna.client.get('/api/v1/me')).status).toBe(401)
    const client = context.client({ ip: '203.0.113.50' })
    expect(
      (await client.post('/api/v1/auth/login', { identifier: 'anna', password: PASSWORD })).status,
    ).toBe(401)
    expect(
      (await client.post('/api/v1/auth/login', { identifier: 'anna', password: NEW_PASSWORD }))
        .status,
    ).toBe(200)

    const again = await context
      .client({ ip: '203.0.113.51' })
      .post('/api/v1/auth/reset-password', { token, password: NEW_PASSWORD })
    expect(errorCode(again)).toBe('reset_invalid')
  })

  it('does not reveal whether an account exists', async () => {
    await setup()
    await registerUser(context, 'ben', {}, { ip: '203.0.113.20' })
    expect(await requestReset('nobody')).toBeUndefined()
    // Ben has no email address.
    expect(await requestReset('ben')).toBeUndefined()
    expect(context.mailer!.sent).toEqual([])
  })

  it('expires links after an hour and limits emails per account', async () => {
    await setup()
    const token = await requestReset('anna')
    context.clock.advance(61 * 60 * 1000)
    const late = await context
      .client()
      .post('/api/v1/auth/reset-password', { token, password: NEW_PASSWORD })
    expect(errorCode(late)).toBe('reset_invalid')
    expect(context.services.cleanup.run().passwordResets).toBe(1)

    for (let attempt = 0; attempt < 4; attempt++) {
      await context
        .client({ ip: `203.0.113.${60 + attempt}` })
        .post('/api/v1/auth/forgot-password', { identifier: 'anna' })
    }
    await context.services.notifications.idle()
    expect(context.mailer!.sent).toHaveLength(1 + 3)
  })

  it('rejects made-up tokens', async () => {
    await setup()
    const response = await context
      .client()
      .post('/api/v1/auth/reset-password', { token: 'made-up', password: NEW_PASSWORD })
    expect(errorCode(response)).toBe('reset_invalid')
  })
})
