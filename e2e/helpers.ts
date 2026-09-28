import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

export const ADMIN = {
  name: 'Anna Admin',
  username: 'anna.admin',
  password: 'correct horse battery staple',
}

export const MEMBER = {
  name: 'Ben Member',
  username: 'ben.member',
  password: 'another long passphrase',
}

export async function signIn(page: Page, user: { username: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(user.username)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/my-day')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My Day')
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

export const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Main' })

/** The rows of a task list, by the list's label (a list, a smart list or a section). */
export const rows = (page: Page, label: string) =>
  page.getByRole('list', { name: label, exact: true }).getByRole('listitem')

/** The button on a task row that opens its details (its name starts with the title). */
export const task = (page: Page, title: string) =>
  page.getByRole('button', { name: new RegExp(`^${title}`) })

export async function openList(page: Page, name: string) {
  await sidebar(page)
    .getByRole('link', { name: new RegExp(`^${name}`) })
    .click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

export async function addTasks(page: Page, ...titles: string[]) {
  const field = page.getByLabel('Add task')
  for (const title of titles) {
    await field.fill(title)
    await field.press('Enter')
    await expect(task(page, title)).toBeVisible()
  }
}

/** Fails on any WCAG 2.1 A/AA violation, in light and in dark mode. */
export async function expectAccessible(page: Page) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    // Let transitions settle so axe sees final colors.
    await page.waitForTimeout(300)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const summary = results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.help}\n  ${violation.nodes.map((node) => node.target.join(' ')).join('\n  ')}`,
    )
    expect(summary, `accessibility violations in ${colorScheme} mode`).toEqual([])
  }
  await page.emulateMedia({ colorScheme: null })
}
