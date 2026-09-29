import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test'

import {
  addTasks,
  ADMIN,
  expectAccessible,
  MEMBER,
  openList,
  rows,
  sidebar,
  signIn,
  task,
} from './helpers'

test.describe.configure({ mode: 'serial' })

/** Ben, signed in in a browser of his own, next to Anna's. */
async function openAsBen(browser: Browser, testInfo: TestInfo): Promise<Page> {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    locale: 'en-US',
    timezoneId: 'Europe/Berlin',
  })
  const page = await context.newPage()
  await signIn(page, MEMBER)
  return page
}

test('sharing a list and working on it together, live', async ({ page, browser }, testInfo) => {
  await signIn(page, ADMIN)
  await page.getByRole('button', { name: 'New list' }).click()
  const listDialog = page.getByRole('dialog', { name: 'New list' })
  await listDialog.getByLabel('Name', { exact: true }).fill('Flat')
  await listDialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Flat' })).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Flat' }).click()
  await page.getByRole('menuitem', { name: 'Share…' }).click()
  const share = page.getByRole('dialog', { name: 'Share “Flat”' })
  await share.getByLabel('Person').selectOption({ label: 'Ben Member (@ben.member)' })
  await share.getByLabel('Access', { exact: true }).selectOption('editor')
  await share.getByRole('button', { name: 'Share', exact: true }).click()
  await expect(share.getByLabel('Access for Ben Member')).toHaveValue('editor')
  await expectAccessible(page)
  await page.keyboard.press('Escape')

  // The list appears for Ben, marked as shared.
  const ben = await openAsBen(browser, testInfo)
  const bensLink = sidebar(ben).getByRole('link', { name: /^Flat/ })
  await expect(bensLink.getByRole('img', { name: 'Shared list' })).toBeVisible()
  await bensLink.click()

  // Changes show up on the other side without reloading.
  await addTasks(page, 'Buy detergent')
  await expect(rows(ben, 'Flat')).toHaveText([/^Buy detergent/])
  await ben.getByRole('checkbox', { name: 'Mark “Buy detergent” as completed' }).click()
  await expect(
    page
      .getByRole('region', { name: 'Completed' })
      .getByRole('checkbox', { name: 'Mark “Buy detergent” as not completed' }),
  ).toBeChecked()
  await ben.context().close()
})

test('assigning a task to someone', async ({ page, browser }, testInfo) => {
  await signIn(page, ADMIN)
  await openList(page, 'Flat')
  await addTasks(page, 'Clean the fridge')
  await task(page, 'Clean the fridge').click()
  const details = page.getByRole('complementary', { name: 'Task details' })
  await details.getByLabel('Assign to').selectOption({ label: 'Ben Member' })
  await expect(page.getByRole('img', { name: 'Assigned to Ben Member' })).toBeVisible()
  await expectAccessible(page)

  const ben = await openAsBen(browser, testInfo)
  await sidebar(ben)
    .getByRole('link', { name: /^Assigned to me/ })
    .click()
  await expect(rows(ben, 'Assigned to me')).toHaveText([/^Clean the fridge/])
  await ben.context().close()
})

test('viewers only read, and members can leave', async ({ page, browser }, testInfo) => {
  await signIn(page, ADMIN)
  await openList(page, 'Flat')
  const ben = await openAsBen(browser, testInfo)
  await openList(ben, 'Flat')

  // Anna makes Ben a viewer; his page follows along.
  await page.getByRole('button', { name: 'Share “Flat”' }).click()
  const share = page.getByRole('dialog', { name: 'Share “Flat”' })
  await share.getByLabel('Access for Ben Member').selectOption('viewer')
  await page.keyboard.press('Escape')

  await expect(ben.getByText('You can view this list, but not change it.')).toBeVisible()
  await expect(ben.getByLabel('Add task')).toHaveCount(0)
  await expect(ben.getByRole('checkbox', { name: /Clean the fridge/ })).toBeDisabled()
  await expectAccessible(ben)

  await ben.getByRole('button', { name: 'Actions for Flat' }).click()
  await ben.getByRole('menuitem', { name: 'Leave list…' }).click()
  await ben.getByRole('alertdialog').getByRole('button', { name: 'Leave' }).click()
  await expect(ben).toHaveURL('/my-day')
  await expect(sidebar(ben).getByRole('link', { name: /^Flat/ })).toHaveCount(0)
  await ben.context().close()

  // Anna sees that Ben is gone – and could add him again.
  await page.getByRole('button', { name: 'Actions for Flat' }).click()
  await page.getByRole('menuitem', { name: 'Share…' }).click()
  await expect(
    share.getByRole('region', { name: 'People with access' }).getByText('Ben Member'),
  ).toHaveCount(0)
  await expect(share.getByRole('option', { name: 'Ben Member (@ben.member)' })).toBeAttached()
})
