import type { List, NotificationChannel, PushStatus, Task } from '@crystal/shared'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'

import { notificationChannels } from '../src/db/schema.js'
import { isAllowedAddress } from '../src/notifications/network.js'
import { deriveVapidKeys } from '../src/notifications/push.js'
import {
  createTestContext,
  errorCode,
  registerUser,
  startCaptureServer,
  TEST_SECRET_KEY,
  type TestClient,
  type TestContext,
} from './helpers.js'

let context: TestContext
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
  await context.close()
})

async function captureServer() {
  const server = await startCaptureServer()
  cleanups.push(server.close)
  return server
}

async function addChannel(client: TestClient, input: Record<string, unknown>) {
  const response = await client.post<NotificationChannel>('/api/v1/notifications/channels', input)
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body
}

const subscription = (name: string) => ({
  endpoint: `https://push.example.com/${name}`,
  keys: { p256dh: `p256dh-${name}`, auth: `auth-${name}` },
})

describe('notification channels', () => {
  it('adds, lists, changes and removes channels without returning secrets', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna')
    const channel = await addChannel(anna.client, {
      type: 'ntfy',
      name: 'Phone',
      server: 'https://ntfy.example.com/',
      topic: 'crystal-anna',
      token: 'tk_secret',
    })
    expect(channel).toMatchObject({
      type: 'ntfy',
      name: 'Phone',
      target: 'ntfy.example.com/crystal-anna',
      enabled: true,
      lastSentAt: null,
      lastError: null,
    })
    expect(JSON.stringify(channel)).not.toContain('tk_secret')

    // Stored encrypted, too.
    const row = context.services.db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.id, channel.id))
      .get()!
    expect(row.config).not.toContain('tk_secret')
    expect(row.config).not.toContain('crystal-anna')

    const paused = await anna.client.patch<NotificationChannel>(
      `/api/v1/notifications/channels/${channel.id}`,
      { name: 'Old phone', enabled: false },
    )
    expect(paused.body).toMatchObject({ name: 'Old phone', enabled: false })

    const list = await anna.client.get<NotificationChannel[]>('/api/v1/notifications/channels')
    expect(list.body.map((item) => item.name)).toEqual(['Old phone'])

    // Nobody else can see or touch it.
    const ben = await registerUser(context, 'ben', {}, { ip: '203.0.113.20' })
    expect((await ben.client.get<unknown[]>('/api/v1/notifications/channels')).body).toEqual([])
    expect((await ben.client.delete(`/api/v1/notifications/channels/${channel.id}`)).status).toBe(
      404,
    )
    expect(
      (await ben.client.post(`/api/v1/notifications/channels/${channel.id}/test`)).status,
    ).toBe(404)

    expect((await anna.client.delete(`/api/v1/notifications/channels/${channel.id}`)).status).toBe(
      204,
    )
    expect((await anna.client.get<unknown[]>('/api/v1/notifications/channels')).body).toEqual([])
  })

  it('validates channel settings', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna')
    const badUrl = await anna.client.post('/api/v1/notifications/channels', {
      type: 'gotify',
      name: 'Gotify',
      server: 'ftp://gotify.local',
      token: 'x',
    })
    expect(errorCode(badUrl)).toBe('validation_failed')
    expect(JSON.stringify(badUrl.body)).toContain('validation.url_invalid')

    const badTopic = await anna.client.post('/api/v1/notifications/channels', {
      type: 'ntfy',
      name: 'ntfy',
      topic: 'has spaces',
    })
    expect(JSON.stringify(badTopic.body)).toContain('validation.topic_format')

    const unknownType = await anna.client.post('/api/v1/notifications/channels', {
      type: 'carrier-pigeon',
      name: 'Pigeon',
    })
    expect(unknownType.status).toBe(400)
  })

  it('publishes to ntfy, Gotify and Apprise', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna')
    const server = await captureServer()

    const ntfy = await addChannel(anna.client, {
      type: 'ntfy',
      name: 'ntfy',
      server: `${server.url}/ntfy`,
      topic: 'crystal-anna',
      token: 'tk_secret',
    })
    const tested = await anna.client.post<NotificationChannel>(
      `/api/v1/notifications/channels/${ntfy.id}/test`,
    )
    expect(tested.status).toBe(200)
    expect(tested.body.lastSentAt).toBe(context.clock.now().toISOString())
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      path: '/ntfy/',
      body: {
        topic: 'crystal-anna',
        title: 'Crystal test notification',
        message: 'Notifications from Crystal arrive here.',
        click: 'http://crystal.test/settings/notifications',
      },
    })
    expect(server.requests[0]!.headers.authorization).toBe('Bearer tk_secret')

    const gotify = await addChannel(anna.client, {
      type: 'gotify',
      name: 'Gotify',
      server: server.url,
      token: 'app-token',
    })
    await anna.client.post(`/api/v1/notifications/channels/${gotify.id}/test`)
    expect(server.requests[1]).toMatchObject({
      path: '/message',
      body: { title: 'Crystal test notification', priority: 5 },
    })
    expect(server.requests[1]!.headers['x-gotify-key']).toBe('app-token')

    const apprise = await addChannel(anna.client, {
      type: 'apprise',
      name: 'Apprise',
      url: `${server.url}/notify/crystal`,
    })
    await anna.client.post(`/api/v1/notifications/channels/${apprise.id}/test`)
    expect(server.requests[2]).toMatchObject({
      path: '/notify/crystal',
      body: { title: 'Crystal test notification', type: 'info' },
    })
  })

  it('reports failures without following redirects or showing responses', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna')
    const server = await captureServer()
    const channel = await addChannel(anna.client, {
      type: 'apprise',
      name: 'Apprise',
      url: `${server.url}/notify`,
    })

    server.respondWith(500)
    const failed = await anna.client.post(`/api/v1/notifications/channels/${channel.id}/test`)
    expect(failed.status).toBe(502)
    expect(failed.body).toMatchObject({
      error: { code: 'delivery_failed', details: { reason: 'http:500' } },
    })
    expect(JSON.stringify(failed.body)).not.toContain('never shown')

    server.respondWith(302, `${server.url}/elsewhere`)
    const redirected = await anna.client.post(`/api/v1/notifications/channels/${channel.id}/test`)
    expect(redirected.body).toMatchObject({ error: { details: { reason: 'http:302' } } })
    expect(server.requests.map((request) => request.path)).toEqual(['/notify', '/notify'])

    const list = await anna.client.get<NotificationChannel[]>('/api/v1/notifications/channels')
    expect(list.body[0]!.lastError).toBe('http:302')

    server.respondWith(200)
    await anna.client.post(`/api/v1/notifications/channels/${channel.id}/test`)
    const healed = await anna.client.get<NotificationChannel[]>('/api/v1/notifications/channels')
    expect(healed.body[0]!.lastError).toBeNull()
  })

  it('never reaches link-local addresses, and private ones only when allowed', async () => {
    context = createTestContext({ REGISTRATION: 'open', NOTIFY_PRIVATE_NETWORKS: 'false' })
    const anna = await registerUser(context, 'anna')
    const server = await captureServer()

    for (const url of [
      server.url,
      server.url.replace('127.0.0.1', 'localhost'),
      'http://169.254.169.254/latest',
      'http://[::ffff:127.0.0.1]:9/',
    ]) {
      const channel = await addChannel(anna.client, { type: 'apprise', name: 'x', url })
      const response = await anna.client.post(`/api/v1/notifications/channels/${channel.id}/test`)
      expect(response.body, url).toMatchObject({ error: { details: { reason: 'blocked' } } })
    }
    expect(server.requests).toEqual([])

    expect(isAllowedAddress('169.254.169.254', true)).toBe(false)
    expect(isAllowedAddress('fe80::1', true)).toBe(false)
    expect(isAllowedAddress('0.0.0.0', true)).toBe(false)
    expect(isAllowedAddress('192.168.1.10', true)).toBe(true)
    expect(isAllowedAddress('192.168.1.10', false)).toBe(false)
    expect(isAllowedAddress('fd12:3456::1', false)).toBe(false)
    expect(isAllowedAddress('::ffff:10.0.0.1', false)).toBe(false)
    expect(isAllowedAddress('93.184.215.14', false)).toBe(true)
    expect(isAllowedAddress('2606:4700::1111', false)).toBe(true)
  })

  it('sends email to the account address when SMTP is configured', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna', { email: 'anna@example.com' })
    const unavailable = await anna.client.post('/api/v1/notifications/channels', {
      type: 'email',
      name: 'Email',
    })
    expect(errorCode(unavailable)).toBe('email_not_configured')
    await context.close()

    context = createTestContext({ REGISTRATION: 'open' }, { mailer: true })
    const ben = await registerUser(context, 'ben')
    const noAddress = await ben.client.post('/api/v1/notifications/channels', {
      type: 'email',
      name: 'Email',
    })
    expect(errorCode(noAddress)).toBe('email_required')

    const carla = await registerUser(
      context,
      'carla',
      { email: 'carla@example.com', locale: 'de' },
      { ip: '203.0.113.30' },
    )
    const channel = await addChannel(carla.client, { type: 'email', name: 'E-Mail' })
    expect(channel.target).toBe('carla@example.com')
    await carla.client.post(`/api/v1/notifications/channels/${channel.id}/test`)
    expect(context.mailer!.sent).toEqual([
      expect.objectContaining({
        to: 'carla@example.com',
        subject: 'Testbenachrichtigung von Crystal',
      }),
    ])
    expect(context.mailer!.sent[0]!.text).toContain('http://crystal.test/settings/notifications')
  })
})

describe('web push', () => {
  it('derives a stable VAPID key pair from the secret', () => {
    const keys = deriveVapidKeys(TEST_SECRET_KEY)
    expect(deriveVapidKeys(TEST_SECRET_KEY)).toEqual(keys)
    expect(deriveVapidKeys(`${TEST_SECRET_KEY}-other`).publicKey).not.toBe(keys.publicKey)
    const publicKey = Buffer.from(keys.publicKey, 'base64url')
    expect(publicKey).toHaveLength(65)
    expect(publicKey[0]).toBe(4)
    expect(Buffer.from(keys.privateKey, 'base64url')).toHaveLength(32)
  })

  it('subscribes browsers, tests them and forgets expired ones', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna')
    const status = await anna.client.get<PushStatus>('/api/v1/notifications/push')
    expect(status.body).toEqual({
      publicKey: deriveVapidKeys(TEST_SECRET_KEY).publicKey,
      devices: [],
    })
    expect((await anna.client.post('/api/v1/notifications/push/test')).status).toBe(404)

    const invalid = await anna.client.post('/api/v1/notifications/push', {
      ...subscription('a'),
      endpoint: 'http://push.example.com/insecure',
    })
    expect(invalid.status).toBe(400)

    expect(
      (await anna.client.post('/api/v1/notifications/push', subscription('laptop'))).status,
    ).toBe(204)
    // Subscribing again only updates the keys.
    await anna.client.post('/api/v1/notifications/push', {
      ...subscription('laptop'),
      keys: { p256dh: 'new', auth: 'new' },
    })
    const devices = (await anna.client.get<PushStatus>('/api/v1/notifications/push')).body.devices
    expect(devices).toHaveLength(1)

    expect((await anna.client.post('/api/v1/notifications/push/test')).status).toBe(204)
    expect(context.push.sent).toMatchObject([
      {
        endpoint: 'https://push.example.com/laptop',
        notification: { title: 'Crystal test notification' },
      },
    ])

    // The push service says the subscription is gone: it is removed.
    context.push.failWith = 'gone'
    const failed = await anna.client.post('/api/v1/notifications/push/test')
    expect(failed.body).toMatchObject({ error: { details: { reason: 'gone' } } })
    expect((await anna.client.get<PushStatus>('/api/v1/notifications/push')).body.devices).toEqual(
      [],
    )
  })

  it('moves a browser to whoever signs in on it and removes devices', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna')
    const ben = await registerUser(context, 'ben', {}, { ip: '203.0.113.20' })
    await anna.client.post('/api/v1/notifications/push', subscription('shared'))
    await ben.client.post('/api/v1/notifications/push', subscription('shared'))

    expect((await anna.client.get<PushStatus>('/api/v1/notifications/push')).body.devices).toEqual(
      [],
    )
    const [device] = (await ben.client.get<PushStatus>('/api/v1/notifications/push')).body.devices
    expect(device).toMatchObject({ endpoint: 'https://push.example.com/shared' })

    expect((await anna.client.delete(`/api/v1/notifications/push/${device!.id}`)).status).toBe(404)
    expect((await ben.client.delete(`/api/v1/notifications/push/${device!.id}`)).status).toBe(204)
  })
})

describe('reminders', () => {
  const MINUTE = 60_000

  async function setup(extra: Record<string, unknown> = {}) {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna', { timezone: 'Europe/Berlin', ...extra })
    await anna.client.post('/api/v1/notifications/push', subscription('anna'))
    return anna
  }

  async function createTask(client: TestClient, input: Record<string, unknown>) {
    const response = await client.post<Task>('/api/v1/tasks', input)
    expect(response.status, JSON.stringify(response.body)).toBe(201)
    return response.body
  }

  const inMinutes = (minutes: number) =>
    new Date(context.clock.now().getTime() + minutes * MINUTE).toISOString()

  const titles = () => context.push.sent.map((entry) => entry.notification.title)

  it('reminds once, when the time has come', async () => {
    const anna = await setup()
    const task = await createTask(anna.client, {
      title: 'Call the plumber',
      dueDate: '2026-09-27',
      dueTime: '14:00',
      remindAt: inMinutes(5),
    })
    expect(task.remindAt).toBe(inMinutes(5))

    await context.services.reminders.tick()
    expect(context.push.sent).toEqual([])

    context.clock.advance(6 * MINUTE)
    await context.services.reminders.tick()
    await context.services.reminders.tick()
    expect(context.push.sent).toHaveLength(1)
    expect(context.push.sent[0]!.notification).toEqual({
      title: 'Reminder: Call the plumber',
      body: 'Due today at 14:00 · Tasks',
      path: `/lists/${task.listId}?task=${task.id}`,
      tag: `task-${task.id}`,
    })

    // A new time rings again.
    await anna.client.patch(`/api/v1/tasks/${task.id}`, { remindAt: inMinutes(1) })
    context.clock.advance(2 * MINUTE)
    await context.services.reminders.tick()
    expect(context.push.sent).toHaveLength(2)

    // Removing it clears it.
    const cleared = await anna.client.patch<Task>(`/api/v1/tasks/${task.id}`, { remindAt: null })
    expect(cleared.body.remindAt).toBeNull()
  })

  it('speaks the recipient’s language and uses their channels', async () => {
    const anna = await setup({ locale: 'de' })
    const server = await captureServer()
    await addChannel(anna.client, {
      type: 'ntfy',
      name: 'ntfy',
      server: server.url,
      topic: 'anna',
    })
    await createTask(anna.client, {
      title: 'Müll rausbringen',
      dueDate: '2026-09-28',
      remindAt: inMinutes(1),
    })
    context.clock.advance(MINUTE)
    await context.services.reminders.tick()
    expect(titles()).toEqual(['Erinnerung: Müll rausbringen'])
    expect(server.requests[0]!.body).toMatchObject({
      title: 'Erinnerung: Müll rausbringen',
      message: 'Fällig morgen · Aufgaben',
    })
  })

  it('skips completed tasks and reminders missed by more than a day', async () => {
    const anna = await setup()
    const done = await createTask(anna.client, { title: 'Done already', remindAt: inMinutes(1) })
    await anna.client.patch(`/api/v1/tasks/${done.id}`, { completed: true })
    await createTask(anna.client, { title: 'Long ago', remindAt: inMinutes(-25 * 60) })
    context.clock.advance(MINUTE)
    await context.services.reminders.tick()
    expect(context.push.sent).toEqual([])
  })

  it('reminds the assignee instead of whoever set the reminder', async () => {
    const anna = await setup()
    const ben = await registerUser(context, 'ben', {}, { ip: '203.0.113.20' })
    await ben.client.post('/api/v1/notifications/push', subscription('ben'))
    const list = (await anna.client.post<List>('/api/v1/lists', { name: 'Home' })).body
    await anna.client.post(`/api/v1/lists/${list.id}/members`, {
      userId: ben.me.id,
      role: 'editor',
    })

    await createTask(anna.client, {
      title: 'Water plants',
      listId: list.id,
      assigneeId: ben.me.id,
      remindAt: inMinutes(1),
    })
    await context.services.notifications.idle()
    context.push.sent.length = 0

    context.clock.advance(MINUTE)
    await context.services.reminders.tick()
    expect(context.push.sent).toMatchObject([
      {
        endpoint: 'https://push.example.com/ben',
        notification: { title: 'Reminder: Water plants' },
      },
    ])
  })

  it('moves the reminder along with a repeating task, at the same local time', async () => {
    const anna = await setup()
    // 09:00 in Berlin (summer time) on the due date.
    const task = await createTask(anna.client, {
      title: 'Weekly review',
      dueDate: '2026-10-24',
      recurrence: { frequency: 'weekly' },
      remindAt: '2026-10-24T07:00:00.000Z',
    })
    await anna.client.patch(`/api/v1/tasks/${task.id}`, { completed: true })
    const tasks = (await anna.client.get<Task[]>(`/api/v1/lists/${task.listId}/tasks`)).body
    const next = tasks.find((item) => item.id !== task.id && item.title === 'Weekly review')!
    expect(next.dueDate).toBe('2026-10-31')
    // Still 09:00 in Berlin, now in winter time.
    expect(next.remindAt).toBe('2026-10-31T08:00:00.000Z')
  })

  it('tells people when a task is assigned to them, unless they opted out', async () => {
    const anna = await setup()
    const ben = await registerUser(context, 'ben', {}, { ip: '203.0.113.20' })
    await ben.client.post('/api/v1/notifications/push', subscription('ben'))
    const list = (await anna.client.post<List>('/api/v1/lists', { name: 'Home' })).body
    await anna.client.post(`/api/v1/lists/${list.id}/members`, {
      userId: ben.me.id,
      role: 'editor',
    })
    const task = await createTask(anna.client, { title: 'Fix the bike', listId: list.id })

    await anna.client.patch(`/api/v1/tasks/${task.id}`, { assigneeId: ben.me.id })
    await context.services.notifications.idle()
    expect(context.push.sent).toEqual([
      {
        endpoint: 'https://push.example.com/ben',
        notification: {
          title: 'Anna assigned a task to you',
          body: 'Fix the bike · Home',
          path: `/lists/${list.id}?task=${task.id}`,
          tag: `task-${task.id}`,
        },
      },
    ])

    // Assigning oneself, or someone who turned it off, sends nothing.
    await ben.client.patch(`/api/v1/tasks/${task.id}`, { assigneeId: null })
    await ben.client.patch(`/api/v1/tasks/${task.id}`, { assigneeId: ben.me.id })
    await ben.client.patch('/api/v1/me', { preferences: { notifyAssigned: false } })
    await anna.client.patch(`/api/v1/tasks/${task.id}`, { assigneeId: null })
    await anna.client.patch(`/api/v1/tasks/${task.id}`, { assigneeId: ben.me.id })
    await context.services.notifications.idle()
    expect(context.push.sent).toHaveLength(1)
  })
})

describe('daily summary', () => {
  it('sends what is due once a day, shortly after the chosen time', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna', { timezone: 'Europe/Berlin' })
    await anna.client.post('/api/v1/notifications/push', subscription('anna'))
    await anna.client.patch('/api/v1/me', {
      preferences: { dailySummary: true, dailySummaryTime: '07:30' },
    })
    await anna.client.post('/api/v1/tasks', { title: 'Overdue', dueDate: '2026-09-27' })
    await anna.client.post('/api/v1/tasks', { title: 'Untimed', dueDate: '2026-09-28' })
    await anna.client.post('/api/v1/tasks', {
      title: 'Dentist',
      dueDate: '2026-09-28',
      dueTime: '09:15',
    })
    await anna.client.post('/api/v1/tasks', { title: 'Later', dueDate: '2026-09-29' })

    // 07:29 in Berlin: too early.
    context.clock.set('2026-09-28T05:29:00.000Z')
    await context.services.reminders.tick()
    expect(context.push.sent).toEqual([])

    context.clock.set('2026-09-28T05:31:00.000Z')
    await context.services.reminders.tick()
    await context.services.reminders.tick()
    expect(context.push.sent.map((entry) => entry.notification)).toEqual([
      {
        title: 'Your day',
        body: '2 tasks due today · 1 overdue\n• 09:15 Dentist\n• Untimed',
        path: '/my-day',
        tag: 'daily-summary',
      },
    ])

    // Not in the evening if the server was down in the morning.
    context.clock.set('2026-09-29T17:00:00.000Z')
    await context.services.reminders.tick()
    expect(context.push.sent).toHaveLength(1)
  })

  it('stays quiet when nothing is due', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna')
    await anna.client.post('/api/v1/notifications/push', subscription('anna'))
    await anna.client.patch('/api/v1/me', {
      preferences: { dailySummary: true, dailySummaryTime: '10:00' },
    })
    await context.services.reminders.tick()
    expect(context.push.sent).toEqual([])
  })
})
