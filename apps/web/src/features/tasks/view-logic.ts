import {
  addDays,
  plannedBucket,
  type List,
  type PlannedBucket,
  type SmartView,
  type Task,
} from '@crystal/shared'

/*
 * Pure helpers for task views. The server decides what a smart list contains;
 * these functions keep the cached data consistent right after a local change
 * (e.g. un-starring a task in "Important" hides it immediately).
 */

export function isOpen(task: Task): boolean {
  return task.completedAt === null
}

export function matchesView(task: Task, view: SmartView, today: string): boolean {
  switch (view) {
    case 'my-day':
      return task.inMyDay
    case 'important':
      return task.important && isOpen(task)
    case 'planned':
      return task.dueDate !== null && isOpen(task)
    case 'overdue':
      return task.dueDate !== null && task.dueDate < today && isOpen(task)
    case 'all':
      return isOpen(task)
    case 'completed':
      return !isOpen(task)
  }
}

export function byPosition(a: Task, b: Task): number {
  return a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1
}

/** Most recently completed first. */
export function byCompletion(a: Task, b: Task): number {
  return (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
}

export function splitByCompletion(tasks: Task[]): { open: Task[]; completed: Task[] } {
  return {
    open: tasks.filter(isOpen),
    completed: tasks.filter((task) => !isOpen(task)).sort(byCompletion),
  }
}

export interface TaskSection<K extends string = string> {
  key: K
  tasks: Task[]
}

/** "Planned" sections in their fixed order; empty sections are left out. */
export function plannedSections(tasks: Task[], today: string): TaskSection<PlannedBucket>[] {
  const order: PlannedBucket[] = ['overdue', 'today', 'tomorrow', 'thisWeek', 'later']
  const buckets = new Map<PlannedBucket, Task[]>()
  for (const task of tasks) {
    if (!task.dueDate) continue
    const bucket = plannedBucket(task.dueDate, today)
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), task])
  }
  return order.filter((key) => buckets.has(key)).map((key) => ({ key, tasks: buckets.get(key)! }))
}

/** "All" sections: one per list, in sidebar order. */
export function listSections(tasks: Task[], lists: List[]): TaskSection[] {
  const byList = new Map<string, Task[]>()
  for (const task of tasks) byList.set(task.listId, [...(byList.get(task.listId) ?? []), task])
  return lists
    .filter((list) => byList.has(list.id))
    .map((list) => ({ key: list.id, tasks: byList.get(list.id)!.sort(byPosition) }))
}

export type DueState = 'overdue' | 'today' | 'future'

export function dueState(task: Task, today: string): DueState | null {
  if (!task.dueDate) return null
  if (task.dueDate < today) return 'overdue'
  if (task.dueDate === today) return 'today'
  return 'future'
}

/**
 * A short label for a due date: "Today", "Tomorrow", a weekday within the
 * next week, otherwise a date (with the year only when it differs).
 */
export function formatDue(
  task: Pick<Task, 'dueDate' | 'dueTime'>,
  today: string,
  locale: string,
  words: { today: string; tomorrow: string; yesterday: string },
): string | null {
  if (!task.dueDate) return null
  const date = new Date(`${task.dueDate}T12:00:00Z`)
  let label: string
  if (task.dueDate === today) label = words.today
  else if (task.dueDate === addDays(today, 1)) label = words.tomorrow
  else if (task.dueDate === addDays(today, -1)) label = words.yesterday
  else if (task.dueDate > today && task.dueDate <= addDays(today, 6)) {
    label = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(date)
  } else {
    label = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...(task.dueDate.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    }).format(date)
  }
  if (!task.dueTime) return label
  const [hours, minutes] = task.dueTime.split(':').map(Number) as [number, number]
  const time = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, 0, 1, hours, minutes)))
  return `${label}, ${time}`
}
