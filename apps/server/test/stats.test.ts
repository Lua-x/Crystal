import type { Stats, Task } from '@crystal/shared'
import { afterEach, describe, expect, it } from 'vitest'

import { createTestContext, registerUser, type TestClient, type TestContext } from './helpers.js'

let context: TestContext
afterEach(() => context.close())

const DAY = 24 * 60 * 60 * 1000

async function complete(client: TestClient, title: string) {
  const task = (await client.post<Task>('/api/v1/tasks', { title })).body
  await client.patch(`/api/v1/tasks/${task.id}`, { completed: true })
}

describe('statistics', () => {
  it('counts completions per week and the streak, in the user’s time zone', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna', { timezone: 'Europe/Berlin' })

    // Wednesday 16 and Thursday 17 September, then Friday 25 to Sunday 27 September.
    context.clock.set('2026-09-16T10:00:00Z')
    await complete(anna.client, 'Week 1, day 1')
    context.clock.advance(DAY)
    await complete(anna.client, 'Week 1, day 2')
    context.clock.set('2026-09-25T10:00:00Z')
    await complete(anna.client, 'Friday')
    context.clock.advance(DAY)
    await complete(anna.client, 'Saturday')
    context.clock.advance(DAY)
    await complete(anna.client, 'Sunday one')
    // 23:30 on Sunday in Berlin is still Sunday there, though Monday is close.
    context.clock.set('2026-09-27T21:30:00Z')
    await complete(anna.client, 'Sunday two')
    await anna.client.post('/api/v1/tasks', { title: 'Still open', dueDate: '2026-09-20' })

    const stats = (await anna.client.get<Stats>('/api/v1/stats')).body
    expect(stats.weeks).toHaveLength(12)
    expect(stats.weeks.at(-1)).toEqual({ start: '2026-09-21', completed: 4 })
    expect(stats.weeks.at(-2)).toEqual({ start: '2026-09-14', completed: 2 })
    expect(stats.weeks[0]!.start).toBe('2026-07-06')
    expect(stats).toMatchObject({
      streak: { current: 3, longest: 3 },
      completedToday: 2,
      completedTotal: 6,
      open: 1,
      overdue: 1,
    })
  })

  it('only counts what the person completed themselves', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna')
    const ben = await registerUser(context, 'ben', {}, { ip: '203.0.113.20' })
    await complete(anna.client, 'Anna did this')
    const stats = (await ben.client.get<Stats>('/api/v1/stats')).body
    expect(stats.completedTotal).toBe(0)
    expect(stats.streak).toEqual({ current: 0, longest: 0 })
  })
})
