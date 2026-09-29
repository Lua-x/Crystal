import { expect, test } from '@playwright/test'

import { ADMIN, expectAccessible, openList, signIn, task } from './helpers'

test.describe.configure({ mode: 'serial' })

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
