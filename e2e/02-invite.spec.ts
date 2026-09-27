import { expect, test } from '@playwright/test'

import { ADMIN, expectAccessible, MEMBER, signIn } from './helpers'

test.describe.configure({ mode: 'serial' })

let inviteLink = ''

test('an administrator creates an invite link', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/settings/invites')
  await expect(page.getByText('No invite links yet')).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: 'New invite link' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Note').fill('For Ben')
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(dialog.getByRole('heading', { name: 'Invite link created' })).toBeVisible()
  inviteLink = await dialog.getByTestId('invite-link').inputValue()
  expect(inviteLink).toMatch(/\/invite\/[\w-]{43}$/)
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Close' }).last().click()

  await expect(page.getByText('For Ben')).toBeVisible()
  await expect(page.getByText('Active')).toBeVisible()
})

test('registration without an invite is not offered', async ({ page }) => {
  await page.goto('/register')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('link', { name: 'Create one' })).toHaveCount(0)
})

test('the invited person creates an account', async ({ page }) => {
  await page.goto(inviteLink)
  await expect(page.getByRole('heading', { name: 'You are invited' })).toBeVisible()
  await expect(page.getByText('Anna Admin invited you to Crystal.')).toBeVisible()
  await expectAccessible(page)

  await page.getByLabel('Name', { exact: true }).fill(MEMBER.name)
  await page.getByLabel('Password', { exact: true }).fill(MEMBER.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ben')
})

test('a used invite link no longer works', async ({ page }) => {
  await page.goto(inviteLink)
  await expect(page.getByText('This invite does not work')).toBeVisible()
})

test('members do not see administration', async ({ page }) => {
  await signIn(page, MEMBER)
  await page.goto('/settings/invites')
  await expect(page).not.toHaveURL(/invites/)
  await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0)
})

test('the administrator sees the new member', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/settings/users')
  await expect(page.getByText('Ben Member')).toBeVisible()
  await expect(page.getByText('Used up')).toHaveCount(0)
  await expectAccessible(page)
})
