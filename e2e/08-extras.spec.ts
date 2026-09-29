import { expect, test, type Download } from '@playwright/test'

import { ADMIN, expectAccessible, openList, signIn, task } from './helpers'

test.describe.configure({ mode: 'serial' })

async function readDownload(download: Download): Promise<string> {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

test('personal API tokens work for scripts and can be revoked', async ({ page, request }) => {
  await signIn(page, ADMIN)
  await page.goto('/settings/api')
  await expect(page.getByText('No tokens yet.')).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: 'New token…' }).click()
  const dialog = page.getByRole('dialog', { name: 'New access token' })
  await dialog.getByLabel('Name').fill('Shortcut')
  await dialog.getByRole('radio', { name: 'Read and change' }).click()
  await dialog.getByRole('button', { name: 'Create' }).click()
  const token = await page.getByTestId('api-token').inputValue()
  expect(token).toMatch(/^crystal_/)
  await expectAccessible(page)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()

  // A script adds a task with the token – no cookie, no Origin.
  const created = await request.post('/api/v1/tasks', {
    headers: { authorization: `Bearer ${token}` },
    data: { title: 'Added by a script' },
  })
  expect(created.status()).toBe(201)
  await openList(page, 'Tasks')
  await expect(task(page, 'Added by a script')).toBeVisible()

  await page.goto('/settings/api')
  await expect(page.getByText(/^Created .* · Last used/)).toBeVisible()
  await page.getByRole('button', { name: 'Revoke Shortcut' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click()
  await expect(page.getByText('No tokens yet.')).toBeVisible()
  const rejected = await request.get('/api/v1/lists', {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(rejected.status()).toBe(401)
})

test('a private calendar link shows tasks with a due date', async ({ page, request }) => {
  await signIn(page, ADMIN)
  await openList(page, 'Tasks')
  // Quick entry turns “tomorrow” into the due date.
  const field = page.getByLabel('Add task')
  await field.fill('Pay rent tomorrow')
  await field.press('Enter')
  await expect(task(page, 'Pay rent')).toContainText('Tomorrow')
  await page.goto('/settings/calendar')
  await page.getByRole('button', { name: 'Create calendar link' }).click()
  const link = page.getByTestId('calendar-link')
  await expect(link).toHaveValue(/\/api\/calendar\/[\w-]+\.ics$/)
  await expect(page.getByRole('link', { name: 'Open in calendar app' })).toHaveAttribute(
    'href',
    /^webcal:\/\//,
  )
  await expectAccessible(page)

  const url = await link.inputValue()
  const feed = await request.get(url)
  expect(feed.status()).toBe(200)
  expect(feed.headers()['content-type']).toContain('text/calendar')
  const body = await feed.text()
  expect(body).toContain('BEGIN:VCALENDAR')
  expect(body).toContain('SUMMARY:Pay rent')

  // A new link replaces the old one.
  await page.getByRole('button', { name: 'New link…' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Replace' }).click()
  await expect(link).not.toHaveValue(url)
  expect((await request.get(url)).status()).toBe(404)
})

test('exporting everything and importing a Todoist project', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/settings/transfer')
  await expectAccessible(page)

  const downloading = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download export' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/^crystal-export-\d{4}-\d{2}-\d{2}\.json$/)
  const exported = JSON.parse(await readDownload(download)) as {
    format: string
    lists: { name: string }[]
  }
  expect(exported.format).toBe('crystal')
  expect(exported.lists.map((list) => list.name)).toContain('Tasks')

  await page.getByLabel('From').selectOption('todoist')
  await page.getByLabel('File').setInputFiles({
    name: 'Garden.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,DATE,DATE_LANG\n' +
        'task,Plant tulips @outside,,1,1,every saturday,en\n' +
        'task,Buy bulbs,,4,2,,en\n' +
        'task,Mow the lawn,,4,1,,en\n',
    ),
  })
  await expect(page.getByLabel('Name of the new list')).toHaveValue('Garden')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Imported 2 tasks into 1 list.' }),
  ).toBeVisible()
  await expectAccessible(page)

  await openList(page, 'Garden')
  await expect(task(page, 'Plant tulips')).toContainText('#outside')
  await expect(task(page, 'Mow the lawn')).toBeVisible()
})

test('administrators back up the database', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/settings/backups')
  await expect(page.getByText(/backs up the database every 24 hours/)).toBeVisible()
  await page.getByRole('button', { name: 'Back up now' }).click()
  const download = page.getByRole('link', { name: /^Download crystal-.*\.db$/ }).first()
  await expect(download).toHaveAttribute('href', /^\/api\/v1\/admin\/backups\/crystal-/)
  await expectAccessible(page)

  const downloading = page.waitForEvent('download')
  await download.click()
  expect((await downloading).suggestedFilename()).toMatch(/^crystal-.*\.db$/)
})

test('the API documentation loads without breaking the content security policy', async ({
  page,
}) => {
  await signIn(page, ADMIN)
  // Only the documentation counts (the sign-in page logs the expected 401 of `/me`).
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))
  await page.goto('/api/docs')
  await expect(page.getByRole('heading', { name: /Crystal API/ })).toBeVisible()
  await page.getByRole('link', { name: 'Tasks', exact: true }).click()
  await expect(page.getByText('/api/v1/tasks', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Authorize' })).toBeVisible()
  expect(problems).toEqual([])
})
