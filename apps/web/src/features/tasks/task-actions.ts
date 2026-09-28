import type { Task } from '@crystal/shared'
import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useUpdateTask } from './data'

/**
 * Checking a task first shows it checked and struck through for a moment, then
 * moves it to "Completed". Unchecking during that moment cancels it.
 */
export function useTaskActions() {
  const update = useUpdateTask()
  const reduceMotion = useReducedMotion()
  const delay = reduceMotion ? 150 : 650
  const [completing, setCompleting] = useState<ReadonlySet<string>>(new Set())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const { mutate } = update

  const forget = useCallback((id: string) => {
    timers.current.delete(id)
    setCompleting((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])

  const toggleComplete = useCallback(
    (task: Task, completed: boolean) => {
      const pending = timers.current.get(task.id)
      if (pending) {
        clearTimeout(pending)
        forget(task.id)
        if (!completed) return
      }
      if (!completed || task.completedAt) {
        mutate({ id: task.id, input: { completed } })
        return
      }
      setCompleting((current) => new Set(current).add(task.id))
      timers.current.set(
        task.id,
        setTimeout(() => {
          forget(task.id)
          mutate({ id: task.id, input: { completed: true } })
        }, delay),
      )
    },
    [delay, forget, mutate],
  )

  // Leaving the view must not lose a completion that is still animating.
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const [id, timer] of pending) {
        clearTimeout(timer)
        mutate({ id, input: { completed: true } })
      }
      pending.clear()
    }
  }, [mutate])

  const toggleImportant = useCallback(
    (task: Task) => mutate({ id: task.id, input: { important: !task.important } }),
    [mutate],
  )

  return { completing, toggleComplete, toggleImportant, update: mutate }
}

export type TaskActions = ReturnType<typeof useTaskActions>
