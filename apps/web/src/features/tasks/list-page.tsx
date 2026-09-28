import type { List } from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { CircleCheck, Ellipsis, ListTodo, Pencil, SearchX, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { EmptyState } from '../../components/ui/empty-state'
import { Spinner } from '../../components/ui/spinner'
import { toast } from '../../components/ui/toast-store'
import { Page } from '../shell/page'
import { listsQuery, listTasksQuery, taskKeys, useDeleteCompleted, useDeleteList } from './data'
import { useToday } from './hooks'
import { ListDialog } from './list-dialogs'
import { LIST_TEXT_CLASS } from './list-colors'
import { QuickAdd } from './quick-add'
import { useTaskActions } from './task-actions'
import { CompletedSection, TaskList } from './task-list'
import { byPosition, splitByCompletion } from './view-logic'

const route = getRouteApi('/_app/lists/$listId')

export function ListPage() {
  const { t } = useTranslation()
  const { listId } = route.useParams()
  const { data: lists, isPending: listsPending } = useQuery(listsQuery)
  const tasksQuery = useQuery(listTasksQuery(listId))
  const today = useToday()
  const actions = useTaskActions()
  const list = lists?.find((item) => item.id === listId)

  if (!list) {
    return (
      <Page title={listsPending ? '' : t('errors.not_found')}>
        {listsPending ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-5" label={t('common.loading')} />
          </div>
        ) : (
          <EmptyState icon={<SearchX />} title={t('errors.not_found')} />
        )}
      </Page>
    )
  }

  // Tasks moved to another list disappear right away, before the refetch.
  const tasks = (tasksQuery.data ?? []).filter((task) => task.listId === listId)
  const { open, completed } = splitByCompletion(tasks)
  open.sort(byPosition)
  const canEdit = list.role !== 'viewer'

  return (
    <Page
      title={list.name}
      titleIcon={list.icon ? <span aria-hidden>{list.icon}</span> : undefined}
      titleClassName={LIST_TEXT_CLASS[list.color]}
      actions={<ListMenu list={list} hasCompleted={completed.length > 0} />}
    >
      {canEdit && <QuickAdd defaults={{ listId }} optimisticKeys={[taskKeys.listTasks(listId)]} />}
      {tasksQuery.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" label={t('common.loading')} />
        </div>
      ) : open.length === 0 && completed.length === 0 ? (
        <EmptyState
          icon={<ListTodo />}
          title={t('views.empty.list')}
          body={canEdit ? t('views.empty.list-body') : undefined}
        />
      ) : (
        <>
          <TaskList
            tasks={open}
            today={today}
            actions={actions}
            label={list.name}
            sortable={canEdit}
          />
          <CompletedSection tasks={completed} today={today} actions={actions} storageKey={listId} />
        </>
      )}
    </Page>
  )
}

function ListMenu({ list, hasCompleted }: { list: List; hasCompleted: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const deleteList = useDeleteList()
  const deleteCompleted = useDeleteCompleted()
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null)
  const isOwner = list.role === 'owner'

  if (!isOwner && !hasCompleted) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('lists.actions', { name: list.name })}
          className="flex size-8 cursor-default items-center justify-center rounded-lg text-text-secondary hover:bg-fill-hover hover:text-text data-[state=open]:bg-fill-selected pointer-coarse:size-11"
        >
          <Ellipsis aria-hidden className="size-4.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isOwner && (
            <DropdownMenuItem icon={<Pencil />} onSelect={() => setDialog('edit')}>
              {t('lists.edit')}
            </DropdownMenuItem>
          )}
          {hasCompleted && list.role !== 'viewer' && (
            <DropdownMenuItem
              icon={<CircleCheck />}
              onSelect={() =>
                deleteCompleted.mutate(list.id, {
                  onSuccess: ({ deleted }) =>
                    toast({ title: t('lists.deletedCompleted', { count: deleted }) }),
                })
              }
            >
              {t('lists.deleteCompleted')}
            </DropdownMenuItem>
          )}
          {isOwner && !list.isDefault && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => setDialog('delete')}>
                {t('lists.delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ListDialog
        open={dialog === 'edit'}
        onOpenChange={(open) => setDialog(open ? 'edit' : null)}
        list={list}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => setDialog(open ? 'delete' : null)}
        title={t('lists.deleteTitle', { name: list.name })}
        description={t('lists.deleteBody')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={async () => {
          await deleteList.mutateAsync(list.id)
          toast({ title: t('lists.deleted') })
          await navigate({ to: '/my-day', replace: true })
        }}
      />
    </>
  )
}
