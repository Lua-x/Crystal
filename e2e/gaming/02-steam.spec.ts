import { expect, test } from '@playwright/test'

import { ADMIN, expectAccessible, sidebar, signIn, task } from '../helpers'

test.describe.configure({ mode: 'serial' })

const STEAM = 'http://127.0.0.1:4175'

test('a Steam account is linked in the settings', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/settings/steam')
  await expect(page.getByRole('heading', { level: 1, name: 'Steam' })).toBeVisible()
  await expectAccessible(page)

  const field = page.getByLabel('Steam profile')
  await field.fill('nobody-at-all')
  await page.getByRole('button', { name: 'Link' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'There is no Steam profile with this name or link.',
  )

  await field.fill('https://steamcommunity.com/id/e2eplayer/')
  await page.getByRole('button', { name: 'Link' }).click()
  await expect(page.getByText('Linked with E2E Player')).toBeVisible()
  await expect(page.getByText('SteamID 76561198000000042')).toBeVisible()
  await expectAccessible(page)
})

test('a game is imported from the Steam library with its achievements', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.getByRole('button', { name: 'Add game', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a game' })
  // With a linked account, the library comes first – most played at the top.
  await expect(dialog.getByRole('radio', { name: 'From Steam' })).toBeChecked()
  const library = dialog.getByRole('list', { name: 'Your Steam library' })
  await expect(library.getByRole('listitem')).toHaveCount(3)
  await expect(library.getByRole('listitem').first()).toContainText('Hollow Knight')
  await expect(library.getByRole('listitem').first()).toContainText('70 hours played')
  await expect(library.getByRole('listitem').last()).toContainText('Not played yet')
  await dialog.getByPlaceholder('Search your library').fill('cel')
  await expect(library.getByRole('listitem')).toHaveText([/Celeste/])
  await dialog.getByPlaceholder('Search your library').fill('')
  await expectAccessible(page)

  await dialog.getByRole('button', { name: 'Import Hollow Knight' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Hollow Knight' })).toBeVisible()
  await expect(page.getByText('1 of 3 done · 33%')).toBeVisible()
  await expect(page.getByText(/^Synced with Steam/)).toBeVisible()
  await expect(task(page, 'Protected')).toContainText('55%')
  await expect(task(page, 'Dream No More')).toContainText('Hidden achievement')
  await expect(page.getByRole('region', { name: 'Completed' })).toContainText('Falsehood')
  await expectAccessible(page)

  // Imported games are opened, not imported twice.
  await page.getByRole('button', { name: 'Add game', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Open Hollow Knight' })).toBeVisible()
  await page.keyboard.press('Escape')
})

test('unlocked achievements are ticked off when syncing', async ({ page, request }) => {
  await signIn(page, ADMIN)
  await sidebar(page)
    .getByRole('link', { name: /^Hollow Knight/ })
    .click()
  await request.post(`${STEAM}/__unlock?name=HORNET_1`)
  await page.getByRole('button', { name: 'Sync with Steam' }).click()
  await expect(page.getByText('1 achievement unlocked')).toBeVisible()
  await expect(page.getByText('2 of 3 done · 66%')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Completed' })).toContainText('Protected')

  await page.getByRole('button', { name: 'Sync with Steam' }).click()
  await expect(page.getByText('Everything is up to date.')).toBeVisible()
})

test('goal details tell how rare an achievement is', async ({ page }) => {
  await signIn(page, ADMIN)
  await sidebar(page)
    .getByRole('link', { name: /^Hollow Knight/ })
    .click()
  await task(page, 'Dream No More').click()
  const details = page.getByRole('complementary', { name: 'Goal details' })
  await expect(details.getByText('Steam achievement')).toBeVisible()
  await expect(details.getByText('Unlocked by 6.8% of players')).toBeVisible()
  await expect(details.getByText(/^Hidden achievement – /)).toBeVisible()
  await expectAccessible(page)
})
