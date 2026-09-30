import type { List } from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import {
  CircleCheck,
  Ellipsis,
  Eye,
  ListTodo,
  LogOut,
  Pencil,
  SearchX,
  Trash2,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { EmptyState } from '../../components/ui/empty-state'
import { toast } from '../../components/ui/toast-store'
import { TaskListSkeleton } from '../../components/ui/task-skeleton'
import { Page } from '../shell/page'
import { useMe } from '../shell/use-me'
import {
  listsQuery,
  listTasksQuery,
  membersQuery,
  taskKeys,
  useDeleteCompleted,
  useDeleteList,
  useRemoveMember,
} from './data'
import { useToday } from './hooks'
import { ListDialog } from './list-dialogs'
import { LIST_TEXT_CLASS } from './list-colors'
import { ShareDialog } from './list-share'
import { QuickAdd } from './quick-add'
import { useTaskActions } from './task-actions'
import { CompletedSection, TaskList } from './task-list'
import { byPosition, splitByCompletion } from './view-logic'

const route = getRouteApi('/_app/lists/$listId')

type ListDialogName = 'edit' | 'delete' | 'share' | 'leave'

export function ListPage() {
  const { t } = useTranslation()
  const { listId } = route.useParams()
  const { data: lists, isPending: listsPending } = useQuery(listsQuery)
  const tasksQuery = useQuery(listTasksQuery(listId))
  const today = useToday()
  const actions = useTaskActions()
  const [dialog, setDialog] = useState<ListDialogName | null>(null)
  const list = lists?.find((item) => item.id === listId)

  if (!list) {
    return (
      <Page title={listsPending ? '' : t('errors.not_found')}>
        {listsPending ? (
          <TaskListSkeleton />
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
      actions={
        <>
          {list.memberCount > 1 && <MemberAvatars list={list} onClick={() => setDialog('share')} />}
          <ListMenu list={list} hasCompleted={completed.length > 0} onOpen={setDialog} />
        </>
      }
    >
      {!canEdit && (
        <p className="mb-4 flex items-center gap-1.5 px-1 text-footnote text-text-secondary">
          <Eye aria-hidden className="size-4" />
          {t('sharing.viewOnly')}
        </p>
      )}
      {canEdit && <QuickAdd defaults={{ listId }} optimisticKeys={[taskKeys.listTasks(listId)]} />}
      {tasksQuery.isPending ? (
        <TaskListSkeleton />
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
      <ListDialogs list={list} dialog={dialog} onDialogChange={setDialog} />
    </Page>
  )
}

/** Up to three members as overlapping avatars; opens the member dialog. */
function MemberAvatars({ list, onClick }: { list: List; onClick: () => void }) {
  const { t } = useTranslation()
  const { data: members = [] } = useQuery(membersQuery(list.id))
  const shown = members.slice(0, 3)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        list.role === 'owner'
          ? t('sharing.title', { name: list.name })
          : t('sharing.membersTitle', { name: list.name })
      }
      className="flex h-8 cursor-default items-center rounded-full pr-1 pl-1.5 hover:bg-fill-hover pointer-coarse:h-11"
    >
      {shown.length === 0 ? (
        <Users aria-hidden className="size-4.5 text-text-secondary" />
      ) : (
        <span className="flex -space-x-1">
          {shown.map((member) => (
            <Avatar
              key={member.userId}
              name={member.displayName}
              seed={member.userId}
              className="size-7 text-caption ring-2 ring-canvas"
            />
          ))}
        </span>
      )}
    </button>
  )
}

function ListMenu({
  list,
  hasCompleted,
  onOpen,
}: {
  list: List
  hasCompleted: boolean
  onOpen: (dialog: ListDialogName) => void
}) {
  const { t } = useTranslation()
  const deleteCompleted = useDeleteCompleted()
  const isOwner = list.role === 'owner'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('lists.actions', { name: list.name })}
        className="flex size-8 cursor-default items-center justify-center rounded-lg text-text-secondary hover:bg-fill-hover hover:text-text data-[state=open]:bg-fill-selected pointer-coarse:size-11"
      >
        <Ellipsis aria-hidden className="size-4.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isOwner && (
          <DropdownMenuItem icon={<Pencil />} onSelect={() => onOpen('edit')}>
            {t('lists.edit')}
          </DropdownMenuItem>
        )}
        {/* The default list is everyone's private inbox. */}
        {!list.isDefault && (
          <DropdownMenuItem icon={<Users />} onSelect={() => onOpen('share')}>
            {isOwner ? t('sharing.share') : t('sharing.members')}
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
            <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => onOpen('delete')}>
              {t('lists.delete')}
            </DropdownMenuItem>
          </>
        )}
        {!isOwner && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<LogOut />} destructive onSelect={() => onOpen('leave')}>
              {t('sharing.leave')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ListDialogs({
  list,
  dialog,
  onDialogChange,
}: {
  list: List
  dialog: ListDialogName | null
  onDialogChange: (dialog: ListDialogName | null) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const me = useMe()
  const deleteList = useDeleteList()
  const removeMember = useRemoveMember()
  const openChange = (name: ListDialogName) => (open: boolean) => onDialogChange(open ? name : null)

  return (
    <>
      <ListDialog open={dialog === 'edit'} onOpenChange={openChange('edit')} list={list} />
      <ShareDialog list={list} open={dialog === 'share'} onOpenChange={openChange('share')} />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={openChange('delete')}
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
      <ConfirmDialog
        open={dialog === 'leave'}
        onOpenChange={openChange('leave')}
        title={t('sharing.leaveTitle', { name: list.name })}
        description={t('sharing.leaveBody')}
        confirmLabel={t('sharing.leaveConfirm')}
        destructive
        onConfirm={async () => {
          await removeMember.mutateAsync({ listId: list.id, userId: me.id })
          toast({ title: t('sharing.left', { name: list.name }) })
          await navigate({ to: '/my-day', replace: true })
        }}
      />
    </>
  )
}
