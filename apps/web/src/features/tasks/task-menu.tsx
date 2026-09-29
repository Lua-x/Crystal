import { addDays, type Task } from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  CalendarPlus,
  CalendarX,
  FolderInput,
  PanelRightOpen,
  Star,
  StarOff,
  Sun,
  SunDim,
  Trash2,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuTrigger,
} from '../../components/ui/context-menu'
import { toast } from '../../components/ui/toast-store'
import { listsQuery, useDeleteTask } from './data'
import { ListIcon } from './list-style'
import type { TaskActions } from './task-actions'

interface TaskMenuProps {
  task: Task
  today: string
  actions: TaskActions
  onOpen: (task: Task) => void
  /** Open on a touch long press; off where a long press picks the task up instead. */
  touchLongPress?: boolean
  /** In a list shared for viewing: only opening and My Day. */
  readOnly?: boolean
  children: ReactElement
}

/** Radix skips its long-press timer when the event was already handled. */
function skipTouchLongPress(event: { pointerType: string; preventDefault: () => void }) {
  if (event.pointerType !== 'mouse') event.preventDefault()
}

/** Right-click (or long-press) menu with the most common task actions. */
export function TaskContextMenu({
  task,
  today,
  actions,
  onOpen,
  touchLongPress = true,
  readOnly = false,
  children,
}: TaskMenuProps) {
  const { t } = useTranslation()

  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        {...(touchLongPress ? {} : { onPointerDown: skipTouchLongPress })}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem icon={<PanelRightOpen />} onSelect={() => onOpen(task)}>
          {t('tasks.menu.open')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          icon={task.inMyDay ? <SunDim /> : <Sun />}
          onSelect={() => actions.update({ id: task.id, input: { myDay: !task.inMyDay } })}
        >
          {task.inMyDay ? t('tasks.menu.removeFromMyDay') : t('tasks.menu.addToMyDay')}
        </ContextMenuItem>
        {!readOnly && <EditActions task={task} today={today} actions={actions} />}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Everything that changes the task itself (not offered in lists shared for viewing). */
function EditActions({ task, today, actions }: Omit<TaskMenuProps, 'onOpen' | 'children'>) {
  const { t } = useTranslation()
  const { data: lists = [] } = useQuery(listsQuery)
  const deleteTask = useDeleteTask()
  const targets = lists.filter((list) => list.id !== task.listId && list.role !== 'viewer')

  return (
    <>
      <ContextMenuItem
        icon={task.important ? <StarOff /> : <Star />}
        onSelect={() => actions.toggleImportant(task)}
      >
        {task.important ? t('tasks.menu.unmarkImportant') : t('tasks.menu.markImportant')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        icon={<CalendarDays />}
        onSelect={() => actions.update({ id: task.id, input: { dueDate: today } })}
      >
        {t('tasks.menu.dueToday')}
      </ContextMenuItem>
      <ContextMenuItem
        icon={<CalendarPlus />}
        onSelect={() => actions.update({ id: task.id, input: { dueDate: addDays(today, 1) } })}
      >
        {t('tasks.menu.dueTomorrow')}
      </ContextMenuItem>
      {task.dueDate && (
        <ContextMenuItem
          icon={<CalendarX />}
          onSelect={() => actions.update({ id: task.id, input: { dueDate: null } })}
        >
          {t('tasks.menu.removeDue')}
        </ContextMenuItem>
      )}
      {targets.length > 0 && (
        <>
          <ContextMenuSeparator />
          <ContextMenuSub icon={<FolderInput />} label={t('tasks.menu.moveTo')}>
            {targets.map((list) => (
              <ContextMenuItem
                key={list.id}
                icon={<ListIcon list={list} className="size-4" />}
                onSelect={() => {
                  actions.update({
                    id: task.id,
                    input: { placement: { listId: list.id, after: null } },
                  })
                  toast({ title: t('lists.movedTo', { list: list.name }) })
                }}
              >
                <span className="truncate">{list.name}</span>
              </ContextMenuItem>
            ))}
          </ContextMenuSub>
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem icon={<Trash2 />} destructive onSelect={() => deleteTask.mutate(task)}>
        {t('tasks.menu.delete')}
      </ContextMenuItem>
    </>
  )
}
