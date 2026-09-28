import { expect, test } from '@playwright/test'

import { ADMIN, expectAccessible, openList, rows, sidebar, signIn, task } from './helpers'

test.describe.configure({ mode: 'serial' })

test('quick entry understands dates, repeats, tags and priority', async ({ page }) => {
  await signIn(page, ADMIN)
  await openList(page, 'Tasks')
  const field = page.getByLabel('Add task')
  await field.fill('Water plants tomorrow 6pm every Monday #garden !!')

  const chips = page.getByRole('list', { name: 'Recognized' }).getByRole('listitem')
  await expect(chips).toHaveText([
    /Tomorrow/,
    /6:00 PM/,
    /Every Monday/,
    /#garden/,
    /Medium priority/,
  ])
  await expectAccessible(page)

  // A dismissed part stays in the title.
  await page.getByRole('button', { name: 'Keep “every Monday” as text' }).click()
  await expect(chips).toHaveCount(4)
  await field.press('Enter')

  const row = task(page, 'Water plants every Monday')
  await expect(row).toContainText('Tomorrow, 6:00 PM')
  await expect(row).toContainText('#garden')
  await expect(page.getByRole('img', { name: 'Medium priority' })).toBeVisible()
})

test('repeating tasks come back when completed', async ({ page }) => {
  await signIn(page, ADMIN)
  await openList(page, 'Tasks')
  const field = page.getByLabel('Add task')
  await field.fill('Take out trash every Tuesday')
  await field.press('Enter')
  await expect(task(page, 'Take out trash')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Every Tuesday' })).toBeVisible()

  await page.getByRole('checkbox', { name: 'Mark “Take out trash” as completed' }).click()
  const completed = page.getByRole('region', { name: 'Completed' })
  await expect(
    completed.getByRole('checkbox', { name: 'Mark “Take out trash” as not completed' }),
  ).toBeChecked()
  // The next occurrence takes its place and carries the rule on.
  await expect(rows(page, 'Tasks').filter({ hasText: 'Take out trash' })).toHaveCount(1)
  await expect(page.getByRole('img', { name: 'Every Tuesday' })).toHaveCount(1)

  // Undoing the tick takes the untouched next occurrence back.
  await completed.getByRole('checkbox', { name: 'Mark “Take out trash” as not completed' }).click()
  await expect(completed).toBeHidden()
  await expect(rows(page, 'Tasks').filter({ hasText: 'Take out trash' })).toHaveCount(1)
})

test('repeat and tags in the details, and browsing a tag', async ({ page }) => {
  await signIn(page, ADMIN)
  await openList(page, 'Tasks')
  await task(page, 'Water plants').click()
  const details = page.getByRole('complementary', { name: 'Task details' })

  await details.getByLabel('Repeat', { exact: true }).selectOption('weekly')
  await expect(details.getByText('Every week', { exact: true })).toBeVisible()

  const tagField = details.getByLabel('Add a tag')
  await tagField.fill('outside')
  await tagField.press('Enter')
  await details.getByRole('button', { name: 'Remove tag garden' }).click()
  await expect(details.getByText('#outside')).toBeVisible()
  await expect(details.getByText('#garden')).toHaveCount(0)
  await expectAccessible(page)

  await sidebar(page)
    .getByRole('link', { name: /^outside/ })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: '#outside' })).toBeVisible()
  await expect(rows(page, '#outside')).toHaveText([/^Water plants/])
  await expect(sidebar(page).getByRole('link', { name: /^garden/ })).toHaveCount(0)
  await expectAccessible(page)
})

test('keyboard shortcuts', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.keyboard.press('?')
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(help).toBeVisible()
  await expectAccessible(page)
  await page.keyboard.press('Escape')
  await expect(help).toBeHidden()

  await page.keyboard.press('g')
  await page.keyboard.press('a')
  await expect(page).toHaveURL('/all')

  await page.keyboard.press('n')
  await expect(page.getByLabel('Add task')).toBeFocused()

  // On a task: S stars it, the arrow keys move, X completes.
  await task(page, 'Oat milk').focus()
  await page.keyboard.press('s')
  await expect(page.getByRole('button', { name: 'Remove “Oat milk” from important' })).toBeVisible()
  await page.keyboard.press('ArrowUp')
  await expect(task(page, 'Water plants')).toBeFocused()
  await page.keyboard.press('x')

  await expect(task(page, 'Water plants')).toHaveCount(1)
  await page.locator('body').press('g')
  await page.keyboard.press('c')
  await expect(page).toHaveURL('/completed')
  await expect(task(page, 'Water plants')).toBeVisible()
})

test('the command palette goes places and adds tasks', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await page.keyboard.type('tasks')
  // Real matches come first; adding "tasks" as a task is offered after them.
  await expect(palette.getByRole('option', { name: 'Tasks', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(palette.getByRole('option', { name: 'Add task “tasks”' })).toBeVisible()
  await expectAccessible(page)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible()

  // Right after closing, the shortcut opens it again – and closes it, too.
  await page.keyboard.press('Control+k')
  await expect(palette).toBeVisible()
  await page.keyboard.press('Control+k')
  await expect(palette).toBeHidden()

  await page.keyboard.press('Control+k')
  await page.keyboard.type('Buy stamps tomorrow')
  await palette.getByRole('option', { name: 'Add task “Buy stamps”' }).click()
  await expect(palette).toBeHidden()
  await expect(task(page, 'Buy stamps')).toContainText('Tomorrow')
})

test('recognition can be turned off', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/settings/account')
  const toggle = page.getByRole('switch', { name: 'Recognize dates, repeats and tags' })
  await toggle.click()
  await expect(toggle).not.toBeChecked()

  await page.goto('/my-day')
  await page.getByLabel('Add task').fill('Call Anna tomorrow')
  await expect(page.getByRole('list', { name: 'Recognized' })).toHaveCount(0)

  await page.goto('/settings/account')
  await toggle.click()
  await expect(toggle).toBeChecked()
})
