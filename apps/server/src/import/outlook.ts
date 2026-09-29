import { zonedTimeToInstant } from '@crystal/shared'

import { csvRecords } from './csv.js'
import { emptyTask, ImportError, toTag, type ImportedList, type ImportedTask } from './types.js'

/** Column names in English and German Outlook. */
const COLUMNS = {
  subject: ['subject', 'betreff'],
  due: ['due date', 'fällig am'],
  reminderOn: ['reminder on/off', 'erinnerung ein/aus'],
  reminderDate: ['reminder date', 'erinnerungsdatum'],
  reminderTime: ['reminder time', 'erinnerungszeit'],
  completed: ['date completed', 'erledigt am'],
  percent: ['% complete', '% erledigt'],
  categories: ['categories', 'kategorien'],
  notes: ['notes', 'notizen'],
  priority: ['priority', 'priorität'],
  status: ['status'],
} as const

const TRUE = new Set(['true', 'wahr', 'ein', 'on', 'yes', 'ja', '1'])
const DONE = new Set(['completed', 'erledigt', 'abgeschlossen'])
const HIGH = new Set(['high', 'hoch'])
const LOW = new Set(['low', 'niedrig'])

interface OutlookOptions {
  listName: string
  timeZone: string
  /** Today in the user's time zone, for completed tasks without a date. */
  today: string
}

/**
 * Reads tasks exported from Outlook as CSV – the way to bring Microsoft To Do
 * lists along, which sync to Outlook's task folders. English and German
 * column names and date formats are understood.
 */
export function parseOutlookCsv(content: string, options: OutlookOptions): ImportedList[] {
  const records = csvRecords(content)
  const first = records[0]
  if (!first || !COLUMNS.subject.some((name) => name in first)) {
    throw new ImportError('This does not look like an Outlook task export (Subject column).')
  }
  const get = (record: Record<string, string>, column: keyof typeof COLUMNS) => {
    for (const name of COLUMNS[column]) {
      const value = record[name]
      if (value) return value
    }
    return ''
  }

  const tasks: ImportedTask[] = []
  for (const record of records) {
    const title = get(record, 'subject')
    if (!title) continue
    const task = emptyTask(title)
    task.notes = get(record, 'notes')
    task.dueDate = parseDate(get(record, 'due'))

    const priority = get(record, 'priority').toLowerCase()
    task.important = HIGH.has(priority)
    if (LOW.has(priority)) task.priority = 1

    task.tags = [
      ...new Set(
        get(record, 'categories')
          .split(/[;,]/)
          .map(toTag)
          .filter((tag): tag is string => tag !== null),
      ),
    ]

    if (TRUE.has(get(record, 'reminderOn').toLowerCase())) {
      const date = parseDate(get(record, 'reminderDate'))
      if (date) {
        task.remindAt = zonedTimeToInstant(
          date,
          parseTime(get(record, 'reminderTime')) ?? '09:00',
          options.timeZone,
        )
      }
    }

    const completedOn = parseDate(get(record, 'completed'))
    const done =
      completedOn !== null ||
      DONE.has(get(record, 'status').toLowerCase()) ||
      get(record, 'percent').replace(/\s/g, '') === '100%'
    if (done) {
      task.completedAt = zonedTimeToInstant(
        completedOn ?? task.dueDate ?? options.today,
        '12:00',
        options.timeZone,
      )
    }
    tasks.push(task)
  }
  return [{ name: options.listName, color: 'blue', icon: null, group: null, tasks }]
}

/** `10/1/2026` (US), `01.10.2026` (German) or `2026-10-01`; `None`/`Keine` → null. */
export function parseDate(value: string): string | null {
  const text = value.trim()
  let year: number
  let month: number
  let day: number
  let match: RegExpExecArray | null
  if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text))) {
    ;[year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else if ((match = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(text))) {
    ;[day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(text))) {
    ;[month, day, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else {
    return null
  }
  if (year < 100) year += 2000
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString().slice(0, 10)
}

/** `9:30:00 AM`, `21:30:00` or `21:30` → `HH:MM`. */
export function parseTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(value.trim())
  if (!match) return null
  let hours = Number(match[1])
  const minutes = Number(match[2])
  const meridiem = match[3]?.toLowerCase()
  if (meridiem === 'pm' && hours < 12) hours += 12
  if (meridiem === 'am' && hours === 12) hours = 0
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
