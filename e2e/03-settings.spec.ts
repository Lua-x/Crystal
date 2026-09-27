import { expect, test } from '@playwright/test'

import { ADMIN, expectAccessible, signIn } from './helpers'

test.describe.configure({ mode: 'serial' })

test('theme and accent color are applied and remembered', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/settings/appearance')
  await expectAccessible(page)

  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('radio', { name: 'Green' }).click()
  await expect(page.getByRole('radio', { name: 'Green' })).toBeChecked()

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('radio', { name: 'Green' })).toBeChecked()

  await page.getByRole('radio', { name: 'Automatic' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
})

test('switching the language', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/settings/account')
  await page.getByLabel('Language', { exact: true }).selectOption('de')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Konto')
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await expectAccessible(page)

  await page.getByLabel('Sprache', { exact: true }).selectOption('en')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Account')
})

test('the device list shows the current session', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/settings/sessions')
  await expect(page.getByText('This device')).toBeVisible()
  await expectAccessible(page)
})

test('the sidebar becomes a drawer on phones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, ADMIN)
  await page.getByRole('button', { name: 'Toggle sidebar' }).click()
  const drawer = page.getByRole('dialog', { name: 'Sidebar' })
  await expect(drawer).toBeVisible()
  await expectAccessible(page)
  await drawer.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Settings' }).click()
  await expect(page).toHaveURL('/settings')
  await expect(drawer).toBeHidden()
})
