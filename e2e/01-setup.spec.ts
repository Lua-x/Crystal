import { expect, test } from '@playwright/test'

import { ADMIN, expectAccessible, signIn, signOut } from './helpers'

test.describe.configure({ mode: 'serial' })

test('a fresh instance asks to create the administrator account', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByRole('heading', { name: 'Set up Crystal' })).toBeVisible()
  await expectAccessible(page)

  // Validation happens before anything is sent.
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Required').first()).toBeVisible()

  await page.getByLabel('Name', { exact: true }).fill(ADMIN.name)
  // The username is suggested from the name.
  await expect(page.getByLabel('Username')).toHaveValue(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Anna')
  await expectAccessible(page)
})

test('setup is only possible once', async ({ page }) => {
  await page.goto('/setup')
  // Already signed in → start page; signed out → login.
  await expect(page).not.toHaveURL(/\/setup$/)
})

test('signing out and back in', async ({ page }) => {
  await signIn(page, ADMIN)
  await signOut(page)
  await expectAccessible(page)

  await page.getByLabel('Username or email').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill('wrong password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('Username or password is incorrect')

  await signIn(page, ADMIN)
})

test('protected pages redirect to the login and back', async ({ page }) => {
  await page.goto('/settings/appearance')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await page.getByLabel('Username or email').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/settings/appearance')
})
