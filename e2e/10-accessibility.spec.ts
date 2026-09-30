import { expect, test, type Page } from '@playwright/test'

import { ADMIN, expectAccessible, sidebar, signIn, task } from './helpers'

test.describe.configure({ mode: 'serial' })

/** Every page of the app, with the heading it shows. */
const PAGES: [path: string, heading: string][] = [
  ['/my-day', 'My Day'],
  ['/important', 'Important'],
  ['/planned', 'Planned'],
  ['/overdue', 'Overdue'],
  ['/assigned', 'Assigned to me'],
  ['/all', 'All'],
  ['/completed', 'Completed'],
  ['/search?q=plumber', 'Search'],
  ['/stats', 'Statistics'],
  ['/settings/account', 'Account'],
  ['/settings/appearance', 'Appearance'],
  ['/settings/notifications', 'Notifications'],
  ['/settings/sessions', 'Devices'],
  ['/settings/calendar', 'Calendar'],
  ['/settings/transfer', 'Import & export'],
  ['/settings/api', 'API'],
  ['/settings/users', 'Users'],
  ['/settings/invites', 'Invites'],
  ['/settings/backups', 'Backups'],
]

async function visit(page: Page, path: string, heading: string) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
}

test('every page has a title and passes the accessibility checks', async ({ page }) => {
  test.setTimeout(120_000)
  await signIn(page, ADMIN)
  for (const [path, heading] of PAGES) {
    await visit(page, path, heading)
    await expect(page, path).toHaveTitle(`${heading} · Crystal`)
    await expectAccessible(page)
  }

  await page.goto('/does-not-exist')
  await expect(page).toHaveTitle('Page not found · Crystal')
  await expectAccessible(page)
})

test('the signed-out pages have titles, too', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveTitle('Welcome back · Crystal')
  await expectAccessible(page)
})

test('keyboard users can skip straight to the page', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
  // The next stop is inside the page, not in the sidebar.
  await page.keyboard.press('Tab')
  const focused = page.locator(':focus')
  await expect(page.locator('main').locator(':focus')).toHaveCount(1)
  await expect(focused).not.toHaveAttribute('data-status', 'active')
})

test('screen readers hear which page opened', async ({ page }) => {
  await signIn(page, ADMIN)
  await sidebar(page)
    .getByRole('link', { name: /^Planned/ })
    .click()
  await expect(page.getByRole('status').filter({ hasText: 'Planned · Crystal' })).toBeAttached()
})

test('a finished day says so', async ({ page }) => {
  await signIn(page, ADMIN)
  const field = page.getByLabel('Add task')
  await field.fill('Final check')
  await field.press('Enter')
  const open = page
    .getByRole('list', { name: 'My Day', exact: true })
    .getByRole('checkbox', { name: /as completed$/ })
  await expect(task(page, 'Final check')).toBeVisible()
  // Tick off everything that is still open in My Day.
  await expect(async () => {
    if ((await open.count()) > 0) await open.first().click()
    await expect(open).toHaveCount(0, { timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  await expect(page.getByText('All done for today')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Completed' })).toContainText('Final check')
  await expectAccessible(page)
})

test('pages fit a 320 pixel wide screen without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await signIn(page, ADMIN)
  for (const [path, heading] of [
    ['/my-day', 'My Day'],
    ['/planned', 'Planned'],
    ['/stats', 'Statistics'],
    ['/settings', 'Settings'],
    ['/settings/notifications', 'Notifications'],
    ['/settings/api', 'API'],
  ] as const) {
    await visit(page, path, heading)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
})
