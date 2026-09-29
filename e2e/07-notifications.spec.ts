import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { expect, test } from '@playwright/test'

import { addTasks, ADMIN, expectAccessible, openList, signIn, task } from './helpers'

test.describe.configure({ mode: 'serial' })

/** Stands in for an ntfy server and records what Crystal publishes. */
const published: Array<{ topic?: string; title?: string; message?: string }> = []
let ntfy: Server
let ntfyUrl: string

test.beforeAll(async () => {
  ntfy = createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => (body += chunk))
    request.on('end', () => {
      published.push(JSON.parse(body) as (typeof published)[number])
      response.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    })
  })
  await new Promise<void>((resolve) => ntfy.listen(0, '127.0.0.1', resolve))
  ntfyUrl = `http://127.0.0.1:${(ntfy.address() as AddressInfo).port}`
})

test.afterAll(async () => {
  await new Promise<void>((resolve) => ntfy.close(() => resolve()))
})

/** The current minute in Berlin (the browser's and the account's time zone), for `datetime-local`. */
function nowInBerlin(): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
  return parts.replace(' ', 'T')
}

test('adding ntfy as a service sends a test message', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/settings/notifications')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Notifications', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('No services yet.')).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: 'Add service…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a service' })
  await dialog.getByLabel('Name').fill('Phone')
  await dialog.getByLabel('Server').fill(ntfyUrl)
  await dialog.getByLabel('Topic').fill('not a topic')
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(dialog.getByText('Letters, digits, - and _ only (up to 64)')).toBeVisible()
  await expectAccessible(page)

  await dialog.getByLabel('Topic').fill('crystal-e2e')
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(dialog).toBeHidden()

  await expect.poll(() => published.length).toBe(1)
  expect(published[0]).toMatchObject({
    topic: 'crystal-e2e',
    title: 'Crystal test notification',
  })
  await expect(page.getByText(/^Last sent/)).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Send notifications to Phone' })).toBeChecked()
})

test('the daily summary can be turned on with a time', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/settings/notifications')
  await page.getByRole('switch', { name: 'Daily summary' }).click()
  const time = page.getByLabel('Time of the daily summary')
  await expect(time).toHaveValue('07:00')
  await time.fill('06:45')
  await time.blur()
  await page.reload()
  await expect(page.getByLabel('Time of the daily summary')).toHaveValue('06:45')
  await expect(
    page.getByRole('switch', { name: 'When someone assigns a task to me' }),
  ).toBeChecked()
})

test('reminders are set in the details and arrive when due', async ({ page }) => {
  await signIn(page, ADMIN)
  await openList(page, 'Tasks')
  await addTasks(page, 'Call the plumber')
  await task(page, 'Call the plumber').click()
  const details = page.getByRole('complementary', { name: 'Task details' })

  // A quick choice sets tomorrow morning; the row shows a bell.
  await details
    .getByRole('group', { name: 'Remind me' })
    .getByRole('button', { name: 'Tomorrow' })
    .click()
  const field = details.getByLabel('Reminder', { exact: true })
  await expect(field).toHaveValue(/T09:00$/)
  await expect(page.getByRole('img', { name: 'Reminder Tomorrow, 9:00 AM' })).toBeVisible()
  await expectAccessible(page)

  // Now: the reminder goes out on the next check.
  const count = published.length
  await field.fill(nowInBerlin())
  await field.blur()
  await expect.poll(() => published.length, { timeout: 15_000 }).toBe(count + 1)
  expect(published.at(-1)).toMatchObject({
    topic: 'crystal-e2e',
    title: 'Reminder: Call the plumber',
    message: 'Tasks',
  })

  await details.getByRole('button', { name: 'Remove reminder' }).click()
  await expect(field).toHaveValue('')
})

test('without email, there is no “Forgot password?”', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveCount(0)
  await page.goto('/forgot-password')
  await expect(page).toHaveURL(/\/login$/)
})
