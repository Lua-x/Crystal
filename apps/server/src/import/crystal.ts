import { crystalExportSchema, LIST_COLORS } from '@crystal/shared'

import { ImportError, type ImportedList } from './types.js'

/** Reads a file written by Crystal's export. */
export function parseCrystalExport(content: string): ImportedList[] {
  let json: unknown
  try {
    json = JSON.parse(content)
  } catch {
    throw new ImportError('The file is not valid JSON.')
  }
  const result = crystalExportSchema.safeParse(json)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new ImportError(
      `This is not a Crystal export (${issue ? `${issue.path.join('.')}: ${issue.message}` : 'unknown format'}).`,
    )
  }
  return result.data.lists.map((list) => ({
    name: list.name,
    color: LIST_COLORS.find((color) => color === list.color) ?? 'blue',
    icon: list.icon,
    deadline: list.deadline,
    group: list.group,
    tasks: list.tasks.map((task) => ({
      title: task.title,
      notes: task.notes,
      dueDate: task.dueDate,
      dueTime: task.dueDate ? task.dueTime : null,
      important: task.important,
      priority: task.priority,
      recurrence: task.recurrence,
      tags: task.tags,
      remindAt: task.remindAt ? new Date(task.remindAt) : null,
      completedAt: task.completedAt ? new Date(task.completedAt) : null,
      subtasks: task.subtasks.map((subtask) => ({
        title: subtask.title,
        completed: subtask.completedAt !== null,
      })),
    })),
  }))
}
