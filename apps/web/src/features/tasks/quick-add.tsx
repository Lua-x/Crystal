import type { CreateTaskInput } from '@crystal/shared'
import type { QueryKey } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { newTaskId, useCreateTask } from './data'

interface QuickAddProps {
  /** Applied to every new task, e.g. `{ listId }` or `{ myDay: true }`. */
  defaults: Omit<CreateTaskInput, 'title' | 'id'>
  /** Task arrays where the new task should appear immediately. */
  optimisticKeys: QueryKey[]
}

/** "Add a task": type and press Enter; the field stays focused for the next one. */
export function QuickAdd({ defaults, optimisticKeys }: QuickAddProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const create = useCreateTask(optimisticKeys)
  const inputId = useId()

  const submit = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    create.mutate({ ...defaults, id: newTaskId(), title: trimmed })
    setTitle('')
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="mb-3 flex h-11 items-center gap-2 rounded-xl bg-fill-control px-3 transition-shadow focus-within:ring-4 focus-within:ring-accent-soft pointer-coarse:h-12"
    >
      <label htmlFor={inputId} className="flex shrink-0 text-accent-text">
        <Plus aria-hidden className="size-5" />
        <span className="sr-only">{t('tasks.add')}</span>
      </label>
      <input
        id={inputId}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t('tasks.addPlaceholder')}
        maxLength={500}
        enterKeyHint="done"
        autoComplete="off"
        className="h-full min-w-0 flex-1 bg-transparent text-body outline-none"
      />
    </form>
  )
}
