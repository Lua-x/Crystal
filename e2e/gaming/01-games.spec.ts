import { expect, test, type Page } from '@playwright/test'

import { ADMIN, expectAccessible, sidebar, signIn, task } from '../helpers'

test.describe.configure({ mode: 'serial' })

/** A 2×1 PNG, enough for a cover. */
const COVER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGNgYGD4z8DAAAAECQEAhFJFgAAAAABJRU5ErkJggg==',
  'base64',
)

/** The date `days` from today in the time zone the tests run in, as `YYYY-MM-DD`. */
function inDays(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

async function addGoals(page: Page, ...titles: string[]) {
  const field = page.getByLabel('Add goal')
  for (const title of titles) {
    await field.fill(title)
    await field.press('Enter')
    await expect(task(page, title)).toBeVisible()
  }
}

test('setup chooses gaming for the whole instance', async ({ page }) => {
  await page.goto('/setup')
  await page.getByRole('radio', { name: 'Gaming' }).click()
  await expect(page.getByRole('radio', { name: 'Gaming' })).toBeChecked()
  await expect(page.getByText('cannot be changed later')).toBeVisible()
  await expectAccessible(page)

  await page.getByLabel('Name', { exact: true }).fill(ADMIN.name)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/my-day')

  // Games instead of lists; goals without a game go to “General”.
  await expect(page.getByRole('list', { name: 'My games' }).getByRole('link')).toHaveText([
    'General',
  ])
  await expect(page.getByRole('button', { name: 'Add game', exact: true })).toBeVisible()
  await expect(page.getByLabel('Add goal')).toBeVisible()
  await expect(page.getByText('What do you want to play today?')).toBeVisible()
  await expectAccessible(page)
})

test('the choice cannot be made again', async ({ page }) => {
  await page.goto('/setup')
  await expect(page).not.toHaveURL(/\/setup$/)
})

test('a game gets a cover and a finish-by date', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.getByRole('button', { name: 'Add game', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a game' })
  await dialog.getByLabel('Name', { exact: true }).fill('Silksong')

  // A file that is no picture is refused right away.
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  })
  await expect(dialog.getByRole('alert')).toHaveText(
    'Choose a picture in PNG, JPEG, WebP, GIF or AVIF format.',
  )
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: COVER,
  })
  await expect(dialog.getByRole('button', { name: 'Change picture…' })).toBeVisible()
  await dialog.getByLabel('Finish by').fill(inDays(10))
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Silksong' })).toBeVisible()
  const cover = page.locator('main img').first()
  await expect(cover).toHaveAttribute('src', /^\/api\/v1\/images\//)
  await expect(page.getByText(/Finish by .* · 10 days left/)).toBeVisible()
  await expect(page.getByText('No goals yet')).toBeVisible()
})

test('progress follows the goals', async ({ page }) => {
  await signIn(page, ADMIN)
  await sidebar(page)
    .getByRole('link', { name: /^Silksong/ })
    .click()
  await addGoals(page, 'Defeat Hornet', 'Find all grubs', 'Reach Dirtmouth', 'Beat the Radiance')
  const progress = page.getByRole('progressbar', { name: 'Progress' })
  await expect(progress).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByText('0 of 4 done · 0%')).toBeVisible()

  await page.getByRole('checkbox', { name: 'Mark “Reach Dirtmouth” as completed' }).click()
  await expect(page.getByText('1 of 4 done · 25%')).toBeVisible()
  await expect(progress).toHaveAttribute('aria-valuenow', '1')
  await expectAccessible(page)
})

test('the finish-by date and cover can be changed or removed', async ({ page }) => {
  await signIn(page, ADMIN)
  await sidebar(page)
    .getByRole('link', { name: /^Silksong/ })
    .click()
  await page.getByRole('button', { name: 'Actions for Silksong' }).click()
  await page.getByRole('menuitem', { name: 'Edit game…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit game' })
  await dialog.getByLabel('Finish by').fill(inDays(-2))
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/Finish by .* · 2 days over/)).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Silksong' }).click()
  await page.getByRole('menuitem', { name: 'Edit game…' }).click()
  await dialog.getByRole('button', { name: 'Remove date' }).click()
  await dialog.getByRole('button', { name: 'Remove picture' }).click()
  await expect(dialog.getByRole('button', { name: 'Choose picture…' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText(/Finish by/)).toHaveCount(0)
  await expect(page.locator('main img')).toHaveCount(0)
  // The progress stays.
  await expect(page.getByText('1 of 4 done · 25%')).toBeVisible()
})

test('goals use gaming words everywhere', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette.getByPlaceholder('Type a command, game or goal…')).toBeVisible()
  await page.keyboard.press('Escape')

  await sidebar(page)
    .getByRole('link', { name: /^Silksong/ })
    .click()
  await task(page, 'Defeat Hornet').click()
  const details = page.getByRole('complementary', { name: 'Goal details' })
  await expect(details.getByLabel('Finish by')).toBeVisible()
  await expect(details.getByRole('combobox', { name: 'Game' })).toBeVisible()
})
