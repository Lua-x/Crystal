import { tagSchema, type ListColor, type Priority, type Recurrence } from '@crystal/shared'

/** A task as the import sources describe it, before it is stored. */
export interface ImportedTask {
  title: string
  notes: string
  dueDate: string | null
  dueTime: string | null
  important: boolean
  priority: Priority
  recurrence: Recurrence | null
  tags: string[]
  remindAt: Date | null
  completedAt: Date | null
  subtasks: { title: string; completed: boolean }[]
}

export interface ImportedList {
  name: string
  color: ListColor
  icon: string | null
  /** Name of the sidebar group to put the list in. */
  group: string | null
  tasks: ImportedTask[]
}

/** A file that cannot be imported; the message says why (in English). */
export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

export function emptyTask(title: string): ImportedTask {
  return {
    title,
    notes: '',
    dueDate: null,
    dueTime: null,
    important: false,
    priority: 0,
    recurrence: null,
    tags: [],
    remindAt: null,
    completedAt: null,
    subtasks: [],
  }
}

/** A label or category as a Crystal tag (`Home Office` → `home-office`), or null. */
export function toTag(name: string): string | null {
  const result = tagSchema.safeParse(
    name
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}_\-/]/gu, ''),
  )
  return result.success ? result.data : null
}
