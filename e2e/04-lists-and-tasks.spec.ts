import { expect, test } from '@playwright/test'

import { addTasks, ADMIN, expectAccessible, openList, rows, sidebar, signIn, task } from './helpers'

test.describe.configure({ mode: 'serial' })

test('creating a list', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.getByRole('button', { name: 'New list' }).click()
  const dialog = page.getByRole('dialog', { name: 'New list' })

  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Required')

  await dialog.getByLabel('Name', { exact: true }).fill('Groceries')
  await dialog.getByRole('radio', { name: 'Green' }).click()
  await dialog.getByRole('radio', { name: '🛒' }).click()
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Create' }).click()

  // The new list opens right away.
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/lists\/[\w-]+$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible()
  await expect(page.getByText('No tasks yet')).toBeVisible()
  await expect(sidebar(page).getByRole('link', { name: 'Groceries' })).toBeVisible()
})

test('adding, completing and deleting tasks', async ({ page }) => {
  await signIn(page, ADMIN)
  await openList(page, 'Groceries')
  await addTasks(page, 'Oat milk', 'Tomatoes', 'Bread')

  // New tasks go to the top.
  await expect(rows(page, 'Groceries')).toHaveText([/^Bread/, /^Tomatoes/, /^Oat milk/])
  await expect(sidebar(page).getByRole('link', { name: /^Groceries/ })).toHaveText(/3$/)
  await expectAccessible(page)

  await page.getByRole('checkbox', { name: 'Mark “Tomatoes” as completed' }).click()
  const completed = page.getByRole('region', { name: 'Completed' })
  await expect(
    completed.getByRole('checkbox', { name: 'Mark “Tomatoes” as not completed' }),
  ).toBeChecked()
  await expect(rows(page, 'Groceries')).toHaveText([/^Bread/, /^Oat milk/])

  // Reopened tasks return to their place.
  await completed.getByRole('checkbox', { name: 'Mark “Tomatoes” as not completed' }).click()
  await expect(rows(page, 'Groceries')).toHaveText([/^Bread/, /^Tomatoes/, /^Oat milk/])
  await expect(completed).toBeHidden()

  // Deleting can be undone.
  await task(page, 'Oat milk').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete task' }).click()
  await expect(rows(page, 'Groceries')).toHaveText([/^Bread/, /^Tomatoes/])
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(rows(page, 'Groceries')).toHaveText([/^Bread/, /^Tomatoes/, /^Oat milk/])
})

test('reordering tasks with the keyboard', async ({ page }) => {
  await signIn(page, ADMIN)
  await openList(page, 'Groceries')

  // Screen readers hear each step through the live region.
  await page.getByRole('button', { name: 'Move “Bread”' }).focus()
  await page.keyboard.press('Space')
  await expect(page.getByText('Picked up Bread.')).toBeAttached()
  // dnd-kit listens for arrow keys only from the next task on, and Chrome handles input
  // before timers – so a key pressed right away is ignored. Ignored presses move nothing,
  // which makes repeating safe.
  await expect(async () => {
    await page.keyboard.press('ArrowDown')
    await expect(page.getByText('Bread moved over Tomatoes.')).toBeAttached({ timeout: 250 })
  }).toPass()
  await page.keyboard.press('Space')

  await expect(rows(page, 'Groceries')).toHaveText([/^Tomatoes/, /^Bread/, /^Oat milk/])
  await page.reload()
  await expect(rows(page, 'Groceries')).toHaveText([/^Tomatoes/, /^Bread/, /^Oat milk/])
})

test('editing a task in the details', async ({ page }) => {
  await signIn(page, ADMIN)
  await openList(page, 'Groceries')
  await task(page, 'Bread').click()

  const details = page.getByRole('complementary', { name: 'Task details' })
  await expect(details.getByLabel('Title', { exact: true })).toHaveValue('Bread')
  await expect(page).toHaveURL(/\?task=[\w-]+$/)

  const step = details.getByLabel('Add a step')
  await step.fill('Whole grain')
  await step.press('Enter')
  await expect(
    details.getByRole('checkbox', { name: 'Mark step “Whole grain” as completed' }),
  ).toBeVisible()

  await details.getByRole('button', { name: 'Add to My Day' }).click()
  await expect(details.getByRole('button', { name: 'Added to My Day' })).toBeVisible()
  await details.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(details.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await details.getByRole('radio', { name: 'High' }).click()
  await details.getByRole('textbox', { name: 'Note', exact: true }).fill('From the **bakery**')
  await expectAccessible(page)

  await details.getByRole('button', { name: 'Close details' }).click()
  await expect(details).toBeHidden()
  const row = task(page, 'Bread')
  await expect(row).toContainText('My Day')
  await expect(row).toContainText('Today')
  await expect(row).toContainText('0 of 1')
  await expect(page.getByRole('img', { name: 'High priority' })).toBeVisible()

  // Everything was saved.
  await page.reload()
  await task(page, 'Bread').click()
  await expect(details.locator('strong')).toHaveText('bakery')
  await expect(details.getByRole('radio', { name: 'High' })).toBeChecked()
})

test('smart lists collect tasks from all lists', async ({ page }) => {
  await signIn(page, ADMIN)
  await expect(rows(page, 'My Day')).toHaveText([/^Bread/])
  await expect(sidebar(page).getByRole('link', { name: /^My Day/ })).toHaveAccessibleName(
    'My Day, 1 open task',
  )

  await sidebar(page)
    .getByRole('link', { name: /^Planned/ })
    .click()
  await expect(page.getByRole('heading', { level: 2, name: 'Today' })).toBeVisible()
  await expect(rows(page, 'Today')).toHaveText([/^Bread/])
  await expectAccessible(page)

  await openList(page, 'Groceries')
  await page.getByRole('button', { name: 'Mark “Tomatoes” as important' }).click()
  await sidebar(page)
    .getByRole('link', { name: /^Important/ })
    .click()
  await expect(rows(page, 'Important')).toHaveText([/^Tomatoes/])

  // Un-starring removes the task from "Important" right away.
  await page.getByRole('button', { name: 'Remove “Tomatoes” from important' }).click()
  await expect(page.getByText('Nothing important right now')).toBeVisible()

  // "All" groups open tasks by list, in sidebar order.
  await sidebar(page).getByRole('link', { name: /^All/ }).click()
  const sections = page.getByRole('main').getByRole('heading', { level: 2 })
  await expect(sections).toHaveCount(1)
  await expect(sections).toHaveAccessibleName('Groceries')
  await expect(rows(page, 'Groceries')).toHaveText([/^Tomatoes/, /^Bread/, /^Oat milk/])
  await expectAccessible(page)
})

test('searching titles, notes and steps', async ({ page }) => {
  await signIn(page, ADMIN)
  const search = page.getByRole('searchbox', { name: 'Search tasks' })

  // "bak" matches the note of "Bread", "grain" its step.
  await search.fill('bak')
  await expect(page).toHaveURL('/search?q=bak')
  await expect(rows(page, 'Search')).toHaveText([/^Bread/])
  await expectAccessible(page)

  await search.fill('grain')
  await expect(rows(page, 'Search')).toHaveText([/^Bread/])

  await search.fill('pineapple')
  await expect(page.getByText('No task matches “pineapple”.')).toBeVisible()
})

test('moving a task to another list', async ({ page }) => {
  await signIn(page, ADMIN)
  await openList(page, 'Groceries')

  await task(page, 'Oat milk').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Move to' }).click()
  await page.getByRole('menuitem', { name: 'Tasks', exact: true }).click()
  await expect(rows(page, 'Groceries')).toHaveText([/^Tomatoes/, /^Bread/])

  await openList(page, 'Tasks')
  await expect(rows(page, 'Tasks')).toHaveText([/^Oat milk/])
  // The default list can be edited but not deleted.
  await page.getByRole('button', { name: 'Actions for Tasks' }).click()
  await expect(page.getByRole('menuitem', { name: 'Edit list…' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Delete list…' })).toHaveCount(0)
  await page.keyboard.press('Escape')
})

test('task details open as a sheet on phones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, ADMIN)
  await page.goto('/all')
  await task(page, 'Oat milk').click()

  const sheet = page.getByRole('dialog', { name: 'Task details' })
  await expect(sheet.getByLabel('Title', { exact: true })).toHaveValue('Oat milk')
  await expectAccessible(page)
  await sheet.getByRole('button', { name: 'Close details' }).click()
  await expect(sheet).toBeHidden()
  await expect(page).toHaveURL('/all')
})

test('groups, renaming and deleting lists', async ({ page }) => {
  await signIn(page, ADMIN)

  await page.getByRole('button', { name: 'New group' }).click()
  const groupDialog = page.getByRole('dialog', { name: 'New group' })
  await groupDialog.getByLabel('Group name').fill('Home')
  await groupDialog.getByRole('button', { name: 'Create' }).click()
  await expect(sidebar(page).getByRole('button', { name: 'Collapse Home' })).toBeVisible()
  await sidebar(page).getByRole('button', { name: 'Collapse Home' }).click()
  await expect(sidebar(page).getByRole('button', { name: 'Expand Home' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )

  await openList(page, 'Groceries')
  await page.getByRole('button', { name: 'Actions for Groceries' }).click()
  await page.getByRole('menuitem', { name: 'Edit list…' }).click()
  const listDialog = page.getByRole('dialog', { name: 'Edit list' })
  await listDialog.getByLabel('Name', { exact: true }).fill('Shopping')
  await listDialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Shopping' })).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Shopping' }).click()
  await page.getByRole('menuitem', { name: 'Delete list…' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL('/my-day')
  await expect(sidebar(page).getByRole('link', { name: /^Shopping/ })).toHaveCount(0)
  // Its tasks are gone from the smart lists, too.
  await expect(page.getByText('Focus on your day')).toBeVisible()
})
