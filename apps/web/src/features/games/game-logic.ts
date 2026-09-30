import { daysBetween, type List } from '@crystal/shared'

/** Where the server serves a picture of a list, such as a cover. */
export function imageUrl(imageId: string): string {
  return `/api/v1/images/${imageId}`
}

export interface GameProgress {
  done: number
  total: number
  /** Whole percent, rounded down so 99.6 % does not look finished. */
  percent: number
}

/** How many goals of a game are done; `null` while it has none. */
export function gameProgress(
  list: Pick<List, 'openCount' | 'completedCount'>,
): GameProgress | null {
  const total = list.openCount + list.completedCount
  if (total === 0) return null
  return {
    done: list.completedCount,
    total,
    percent: Math.floor((list.completedCount / total) * 100),
  }
}

export type DeadlineState =
  { kind: 'left'; days: number } | { kind: 'today' } | { kind: 'over'; days: number }

/** Where today is relative to the finish-by date. */
export function deadlineState(deadline: string, today: string): DeadlineState {
  const days = daysBetween(today, deadline)
  if (days > 0) return { kind: 'left', days }
  if (days === 0) return { kind: 'today' }
  return { kind: 'over', days: -days }
}
