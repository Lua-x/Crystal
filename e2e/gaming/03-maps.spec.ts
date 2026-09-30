import { expect, test, type Page } from '@playwright/test'

import { ADMIN, expectAccessible, sidebar, signIn } from '../helpers'

test.describe.configure({ mode: 'serial' })

/** A 2×1 PNG; the map view scales it to fit. */
const MAP = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGNgYGD4z8DAAAAECQEAhFJFgAAAAABJRU5ErkJggg==',
  'base64',
)

async function openGame(page: Page) {
  await signIn(page, ADMIN)
  await sidebar(page)
    .getByRole('link', { name: /^Silksong/ })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Silksong' })).toBeVisible()
}

test('a map is added to a game', async ({ page }) => {
  await openGame(page)
  await page.getByRole('button', { name: 'Add map' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a map' })
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'pharloom.png',
    mimeType: 'image/png',
    buffer: MAP,
  })
  // The name is suggested from the file.
  await expect(dialog.getByLabel('Name')).toHaveValue('pharloom')
  await dialog.getByLabel('Name').fill('Pharloom')
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Add map' }).click()

  await expect(page).toHaveURL(/\/maps\//)
  await expect(page.getByRole('heading', { level: 1, name: 'Pharloom' })).toBeVisible()
  await expect(page).toHaveTitle('Pharloom · Crystal')
  await expect(page.getByRole('application', { name: 'Map Pharloom' })).toBeVisible()
  await expectAccessible(page)
})

test('goals are pinned with the mouse or the keyboard', async ({ page }) => {
  await openGame(page)
  await page.getByRole('link', { name: 'Map Pharloom' }).click()
  const map = page.getByRole('application', { name: 'Map Pharloom' })
  const goals = page.getByRole('complementary', { name: 'Goals' })

  await goals.getByRole('button', { name: 'Place “Find all grubs” on the map' }).click()
  await expect(page.getByText('Where is “Find all grubs”?')).toBeVisible()
  await map.click()
  await expect(map.getByRole('button', { name: 'Find all grubs', exact: true })).toBeVisible()
  await expect(
    page.getByRole('status').filter({ hasText: '“Find all grubs” is on the map.' }),
  ).toBeAttached()
  await expect(goals.getByRole('listitem').filter({ hasText: 'Find all grubs' })).toContainText(
    'On this map',
  )

  // Keyboard: the spot in the middle of the view, placed with Enter.
  await goals.getByRole('button', { name: 'Place “Defeat Hornet” on the map' }).click()
  await map.focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  await expect(map.getByRole('button', { name: 'Defeat Hornet', exact: true })).toBeVisible()
  await expectAccessible(page)

  // Pins stay after a reload.
  await page.reload()
  await expect(map.getByRole('button', { name: 'Find all grubs', exact: true })).toBeVisible()
  await expect(map.getByRole('button', { name: 'Defeat Hornet', exact: true })).toBeVisible()
})

test('a pin shows its goal, which can be completed or taken off the map', async ({ page }) => {
  await openGame(page)
  await page.getByRole('link', { name: 'Map Pharloom' }).click()
  const map = page.getByRole('application', { name: 'Map Pharloom' })

  await map.getByRole('button', { name: 'Defeat Hornet', exact: true }).click()
  await expect(map.getByRole('button', { name: 'Defeat Hornet', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('checkbox', { name: 'Mark “Defeat Hornet” as completed' }).click()
  // Completed goals leave the map unless they are shown.
  await expect(map.getByRole('button', { name: /Defeat Hornet/ })).toHaveCount(0)
  await page.getByRole('switch', { name: 'Show completed goals' }).click()
  await expect(map.getByRole('button', { name: 'Defeat Hornet, completed' })).toBeVisible()

  await map.getByRole('button', { name: 'Find all grubs', exact: true }).click()
  await page.getByRole('button', { name: 'Remove pin' }).click()
  await expect(map.getByRole('button', { name: /Find all grubs/ })).toHaveCount(0)
  await expect(
    page
      .getByRole('complementary', { name: 'Goals' })
      .getByRole('listitem')
      .filter({ hasText: 'Find all grubs' }),
  ).toContainText('Not on a map yet')
})

test('maps can be renamed and deleted', async ({ page }) => {
  await openGame(page)
  await page.getByRole('link', { name: 'Map Pharloom' }).click()
  await page.getByRole('button', { name: 'Actions for map Pharloom' }).click()
  await page.getByRole('menuitem', { name: 'Rename map…' }).click()
  const rename = page.getByRole('dialog', { name: 'Rename map' })
  await rename.getByLabel('Name').fill('Pharloom (whole)')
  await rename.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Pharloom (whole)' })).toBeVisible()

  await page.getByRole('button', { name: 'Actions for map Pharloom (whole)' }).click()
  await page.getByRole('menuitem', { name: 'Delete map…' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Silksong' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Map Pharloom/ })).toHaveCount(0)
})
