import { parseQuickEntry, type Locale, type Priority } from '@crystal/shared'

import { csvRecords } from './csv.js'
import { emptyTask, ImportError, toTag, type ImportedList, type ImportedTask } from './types.js'

/** Todoist's CSV priority: 1 is the highest (p1), 4 means none. */
const PRIORITY: Record<string, Priority> = { '1': 3, '2': 2, '3': 1, '4': 0 }
const LABEL = /(^|\s)@([\p{L}\p{N}_\-/]+)/gu
const ISO_DATE = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/

interface TodoistOptions {
  listName: string
  /** Today in the user's time zone, for dates like "tomorrow" or "every monday". */
  today: string
  locale: Locale
}

/**
 * Reads a Todoist project exported as CSV (one file per project): tasks with
 * their description, priority, labels and date – including repeating dates,
 * understood like quick entry. Indented tasks become steps, comments go into
 * the note. Sections are left out.
 */
export function parseTodoistCsv(content: string, options: TodoistOptions): ImportedList[] {
  const records = csvRecords(content)
  const first = records[0]
  if (!first || !('type' in first) || !('content' in first)) {
    throw new ImportError(
      'This does not look like a Todoist CSV export (TYPE and CONTENT columns).',
    )
  }

  const tasks: ImportedTask[] = []
  let current: ImportedTask | undefined
  for (const record of records) {
    const type = record.type?.toLowerCase()
    const text = record.content ?? ''
    if (type === 'note' || type === 'comment') {
      if (current && text) current.notes = current.notes ? `${current.notes}\n\n${text}` : text
      continue
    }
    if (type !== 'task' || !text) continue

    const tags: string[] = []
    const title = text
      .replace(LABEL, (_match, space: string, label: string) => {
        const tag = toTag(label)
        if (tag) tags.push(tag)
        return space
      })
      .trim()
    if (!title) continue

    const indent = Number(record.indent || '1')
    if (indent > 1 && current) {
      current.subtasks.push({ title, completed: false })
      continue
    }

    const task = emptyTask(title)
    task.tags = [...new Set(tags)]
    task.notes = record.description ?? ''
    task.priority = PRIORITY[record.priority ?? ''] ?? 0
    applyDate(task, record.date ?? '', record.date_lang === 'de' ? 'de' : options.locale, options)
    tasks.push(task)
    current = task
  }

  return [{ name: options.listName, color: 'red', icon: null, group: null, tasks }]
}

function applyDate(task: ImportedTask, text: string, locale: Locale, options: TodoistOptions) {
  const value = text.trim()
  if (!value) return
  const iso = ISO_DATE.exec(value)
  if (iso) {
    task.dueDate = iso[1]!
    task.dueTime = iso[2] ?? null
    return
  }
  // Quick entry expects a title in front of the date; any word will do.
  const parsed = parseQuickEntry(`Task ${value}`, { today: options.today, locale })
  if (parsed.dueDate || parsed.recurrence) {
    task.dueDate = parsed.dueDate
    task.dueTime = parsed.dueDate ? parsed.dueTime : null
    task.recurrence = parsed.recurrence
  } else {
    // Keep what Crystal did not understand, instead of losing it.
    const line = `Todoist: ${value}`
    task.notes = task.notes ? `${task.notes}\n\n${line}` : line
  }
}
