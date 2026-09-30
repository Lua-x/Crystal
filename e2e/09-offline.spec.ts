/// <reference lib="dom" />
// (page.evaluate() runs in the browser: service workers, caches and IndexedDB.)
import { expect, test } from '@playwright/test'

import { ADMIN, expectAccessible, openList, signIn, task } from './helpers'

test.describe.configure({ mode: 'serial' })

test('the app can be installed', async ({ page, request }) => {
  await page.goto('/login')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  const manifest = (await (await request.get(href!)).json()) as {
    name: string
    display: string
    icons: { src: string; purpose: string }[]
  }
  expect(manifest).toMatchObject({ name: 'Crystal', display: 'standalone' })
  expect(manifest.icons.map((icon) => icon.purpose)).toContain('maskable')
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200)
  }
})

test('works offline and saves changes once the connection is back', async ({ page, context }) => {
  await signIn(page, ADMIN)
  await openList(page, 'Tasks')
  // The service worker takes over and keeps the app for offline use.
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true)
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await caches.keys()).some((name) => name.startsWith('crystal-app-')),
      ),
    )
    .toBe(true)

  await context.setOffline(true)
  await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toBeVisible()
  const field = page.getByLabel('Add task')
  await field.fill('Written offline')
  await field.press('Enter')
  await expect(task(page, 'Written offline')).toBeVisible()
  await expectAccessible(page)

  // Even a reload works offline: the app comes from the service worker, the
  // lists and the waiting change from the device.
  await page.waitForTimeout(1500)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible()
  await expect(task(page, 'Written offline')).toBeVisible()

  await context.setOffline(false)
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/v1/search?q=offline')
      const found = (await response.json()) as { title: string }[]
      return found.map((item) => item.title)
    })
    .toContain('Written offline')
  await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toHaveCount(0)
})

test('signing out removes the offline copy', async ({ page }) => {
  await signIn(page, ADMIN)
  await openList(page, 'Tasks')
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.waitForTimeout(1500)
  const stored = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open('crystal', 1)
        open.onsuccess = () => {
          const read = open.result.transaction('cache').objectStore('cache').get('queries')
          read.onsuccess = () => resolve(JSON.stringify(read.result ?? null))
        }
      }),
  )
  expect(stored).not.toContain('Written offline')
})
