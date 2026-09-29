import { addDays, type Locale } from '@crystal/shared'

/** What every channel delivers, in the recipient's language. */
export interface Notification {
  title: string
  body: string
  /** Where in the app it leads, e.g. `/lists/…?task=…`. */
  path: string
  /** Devices replace an earlier notification with the same tag. */
  tag?: string
}

export interface TaskInfo {
  id: string
  listId: string
  title: string
  listName: string
  dueDate: string | null
  dueTime: string | null
}

export const taskPath = (task: { id: string; listId: string }) =>
  `/lists/${task.listId}?task=${task.id}`

const TEXT = {
  en: {
    reminder: 'Reminder',
    due: 'Due',
    today: 'today',
    tomorrow: 'tomorrow',
    yesterday: 'yesterday',
    at: 'at',
    assigned: (name: string) => `${name} assigned a task to you`,
    summaryTitle: 'Your day',
    dueToday: (count: number) => (count === 1 ? '1 task due today' : `${count} tasks due today`),
    overdue: (count: number) => `${count} overdue`,
    more: (count: number) => `and ${count} more`,
    testTitle: 'Crystal test notification',
    testBody: 'Notifications from Crystal arrive here.',
    emailFooter:
      'You get this email because you added it as a notification channel in Crystal. ' +
      'You can remove it in the settings under Notifications.',
    resetSubject: 'Reset your Crystal password',
    resetBody: (name: string, username: string, link: string) =>
      `Hi ${name},\n\n` +
      `someone – hopefully you – asked to reset the password of the Crystal account "${username}". ` +
      'Open this link within one hour to choose a new password:\n\n' +
      `${link}\n\n` +
      'If that was not you, ignore this email. Your password stays the same.',
  },
  de: {
    reminder: 'Erinnerung',
    due: 'Fällig',
    today: 'heute',
    tomorrow: 'morgen',
    yesterday: 'gestern',
    at: 'um',
    assigned: (name: string) => `${name} hat dir eine Aufgabe zugewiesen`,
    summaryTitle: 'Dein Tag',
    dueToday: (count: number) =>
      count === 1 ? '1 Aufgabe heute fällig' : `${count} Aufgaben heute fällig`,
    overdue: (count: number) => `${count} überfällig`,
    more: (count: number) => `und ${count} weitere`,
    testTitle: 'Testbenachrichtigung von Crystal',
    testBody: 'Benachrichtigungen von Crystal kommen hier an.',
    emailFooter:
      'Du bekommst diese E-Mail, weil du sie in Crystal als Benachrichtigungskanal eingerichtet hast. ' +
      'Du kannst sie in den Einstellungen unter Benachrichtigungen entfernen.',
    resetSubject: 'Setze dein Crystal-Passwort zurück',
    resetBody: (name: string, username: string, link: string) =>
      `Hallo ${name},\n\n` +
      `jemand – hoffentlich du – möchte das Passwort des Crystal-Kontos „${username}“ zurücksetzen. ` +
      'Öffne diesen Link innerhalb einer Stunde, um ein neues Passwort zu wählen:\n\n' +
      `${link}\n\n` +
      'Wenn du das nicht warst, ignoriere diese E-Mail. Dein Passwort bleibt dann unverändert.',
  },
} satisfies Record<Locale, unknown>

/** "today at 14:00", "Fri, 3 Oct" – relative to the recipient's today. */
function describeDue(locale: Locale, today: string, date: string, time: string | null): string {
  const text = TEXT[locale]
  let day: string
  if (date === today) day = text.today
  else if (date === addDays(today, 1)) day = text.tomorrow
  else if (date === addDays(today, -1)) day = text.yesterday
  else {
    day = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`))
  }
  return time ? `${day} ${text.at} ${time}` : day
}

export function reminderMessage(locale: Locale, today: string, task: TaskInfo): Notification {
  const text = TEXT[locale]
  const due = task.dueDate
    ? `${text.due} ${describeDue(locale, today, task.dueDate, task.dueTime)} · `
    : ''
  return {
    title: `${text.reminder}: ${task.title}`,
    body: `${due}${task.listName}`,
    path: taskPath(task),
    tag: `task-${task.id}`,
  }
}

export function assignedMessage(locale: Locale, assignedBy: string, task: TaskInfo): Notification {
  return {
    title: TEXT[locale].assigned(assignedBy),
    body: `${task.title} · ${task.listName}`,
    path: taskPath(task),
    tag: `task-${task.id}`,
  }
}

const SUMMARY_ITEMS = 5

export function summaryMessage(
  locale: Locale,
  dueToday: ReadonlyArray<{ title: string; dueTime: string | null }>,
  overdue: number,
): Notification {
  const text = TEXT[locale]
  const counts = [dueToday.length > 0 ? text.dueToday(dueToday.length) : '']
  if (overdue > 0) counts.push(text.overdue(overdue))
  const lines = dueToday
    .slice(0, SUMMARY_ITEMS)
    .map((task) => `• ${task.dueTime ? `${task.dueTime} ` : ''}${task.title}`)
  if (dueToday.length > SUMMARY_ITEMS) lines.push(text.more(dueToday.length - SUMMARY_ITEMS))
  return {
    title: text.summaryTitle,
    body: [counts.filter(Boolean).join(' · '), ...lines].join('\n'),
    path: '/my-day',
    tag: 'daily-summary',
  }
}

export function testMessage(locale: Locale): Notification {
  const text = TEXT[locale]
  return { title: text.testTitle, body: text.testBody, path: '/settings/notifications' }
}

export function emailFooter(locale: Locale): string {
  return TEXT[locale].emailFooter
}

export function passwordResetMail(
  locale: Locale,
  user: { displayName: string; username: string },
  link: string,
): { subject: string; text: string } {
  const text = TEXT[locale]
  return {
    subject: text.resetSubject,
    text: text.resetBody(user.displayName, user.username, link),
  }
}
