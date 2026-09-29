import {
  type Attachment,
  type CreateListGroupInput,
  type CreateListInput,
  type CreateTaskInput,
  type List,
  type ListGroup,
  type ListMember,
  type Person,
  type ShareRole,
  type SmartView,
  type Subtask,
  type TagSummary,
  type Task,
  type UpdateListGroupInput,
  type UpdateListInput,
  type UpdateSubtaskInput,
  type UpdateTaskInput,
  type ViewCounts,
  keyBetween,
  recurrenceInputSchema,
  tagsSchema,
  uuidv7,
} from '@crystal/shared'
import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query'
import i18next from 'i18next'

import { toast } from '../../components/ui/toast-store'
import { api, apiUpload } from '../../lib/api'
import { errorMessage } from '../../lib/errors'

export const taskKeys = {
  lists: ['lists'] as const,
  groups: ['list-groups'] as const,
  counts: ['counts'] as const,
  /** Prefix of every cached task array (lists, smart lists, search, suggestions). */
  tasks: ['tasks'] as const,
  listTasks: (listId: string) => ['tasks', 'list', listId] as const,
  view: (view: SmartView) => ['tasks', 'view', view] as const,
  search: (query: string) => ['tasks', 'search', query] as const,
  suggestions: ['tasks', 'suggestions'] as const,
  tagTasks: (tag: string) => ['tasks', 'tag', tag] as const,
  task: (id: string) => ['task', id] as const,
  tags: ['tags'] as const,
  /** Under `lists`, so refreshing the lists refreshes their members, too. */
  members: (listId: string) => ['lists', listId, 'members'] as const,
  people: ['people'] as const,
}

export const membersQuery = (listId: string) =>
  queryOptions({
    queryKey: taskKeys.members(listId),
    queryFn: () => api<ListMember[]>(`/lists/${listId}/members`),
  })

export const peopleQuery = queryOptions({
  queryKey: taskKeys.people,
  queryFn: () => api<Person[]>('/people'),
})

export const tagsQuery = queryOptions({
  queryKey: taskKeys.tags,
  queryFn: () => api<TagSummary[]>('/tags'),
})

export const tagTasksQuery = (tag: string) =>
  queryOptions({
    queryKey: taskKeys.tagTasks(tag),
    queryFn: () => api<Task[]>(`/tags/${encodeURIComponent(tag)}/tasks`),
  })

export const listsQuery = queryOptions({
  queryKey: taskKeys.lists,
  queryFn: () => api<List[]>('/lists'),
})

export const groupsQuery = queryOptions({
  queryKey: taskKeys.groups,
  queryFn: () => api<ListGroup[]>('/list-groups'),
})

export const countsQuery = queryOptions({
  queryKey: taskKeys.counts,
  queryFn: () => api<ViewCounts>('/views/counts'),
})

export const listTasksQuery = (listId: string) =>
  queryOptions({
    queryKey: taskKeys.listTasks(listId),
    queryFn: () => api<Task[]>(`/lists/${listId}/tasks`),
  })

export const viewQuery = (view: SmartView) =>
  queryOptions({
    queryKey: taskKeys.view(view),
    queryFn: () => api<Task[]>(`/views/${view}`),
  })

export const searchQuery = (query: string) =>
  queryOptions({
    queryKey: taskKeys.search(query),
    queryFn: () => api<Task[]>(`/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
    placeholderData: (previous) => previous,
  })

export const suggestionsQuery = queryOptions({
  queryKey: taskKeys.suggestions,
  queryFn: () => api<Task[]>('/views/my-day/suggestions'),
})

export const taskQuery = (id: string) =>
  queryOptions({
    queryKey: taskKeys.task(id),
    queryFn: () => api<Task>(`/tasks/${id}`),
  })

/* ── Cache helpers ─────────────────────────────────────────────── */

type Snapshot = [QueryKey, unknown][]

async function snapshotTasks(queryClient: QueryClient): Promise<Snapshot> {
  await queryClient.cancelQueries({ queryKey: taskKeys.tasks })
  await queryClient.cancelQueries({ queryKey: ['task'] })
  return [
    ...queryClient.getQueriesData({ queryKey: taskKeys.tasks }),
    ...queryClient.getQueriesData({ queryKey: ['task'] }),
  ]
}

function restore(queryClient: QueryClient, snapshot: Snapshot | undefined) {
  for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data)
}

/** Applies `update` to a task wherever it is cached; returning null removes it. */
export function patchCachedTask(
  queryClient: QueryClient,
  id: string,
  update: (task: Task) => Task | null,
) {
  queryClient.setQueriesData<Task[]>({ queryKey: taskKeys.tasks }, (tasks) => {
    if (!tasks?.some((task) => task.id === id)) return tasks
    return tasks.flatMap((task) => {
      if (task.id !== id) return [task]
      const next = update(task)
      return next ? [next] : []
    })
  })
  queryClient.setQueryData<Task>(taskKeys.task(id), (task) =>
    task ? (update(task) ?? task) : task,
  )
}

export function findCachedTask(queryClient: QueryClient, id: string): Task | undefined {
  const detail = queryClient.getQueryData<Task>(taskKeys.task(id))
  if (detail) return detail
  for (const [, tasks] of queryClient.getQueriesData<Task[]>({ queryKey: taskKeys.tasks })) {
    const task = tasks?.find((item) => item.id === id)
    if (task) return task
  }
  return undefined
}

/**
 * Refetches after a change was saved. A page that just opened may still be
 * loading its first data, and that request may have been answered before the
 * change was saved. TanStack Query would join the refetch to that request and
 * keep the stale answer, so such first loads are cancelled and started over.
 */
export function refresh(queryClient: QueryClient, queryKey: QueryKey) {
  void queryClient
    .cancelQueries({
      queryKey,
      predicate: (query) =>
        query.state.data === undefined && query.state.fetchStatus === 'fetching',
    })
    .then(() => queryClient.invalidateQueries({ queryKey }))
}

export function refreshTaskData(queryClient: QueryClient) {
  refresh(queryClient, taskKeys.tasks)
  refresh(queryClient, ['task'])
  refresh(queryClient, taskKeys.counts)
  refresh(queryClient, taskKeys.lists)
  refresh(queryClient, taskKeys.tags)
}

/**
 * Local preview of an update, until the server answers. Server-side effects –
 * a due date for a new repeating task, the next occurrence of a completed
 * one – arrive with the refetch.
 */
function applyUpdate(task: Task, input: UpdateTaskInput, position?: string): Task {
  const next: Task = { ...task, updatedAt: new Date().toISOString() }
  if (input.title !== undefined) next.title = input.title
  if (input.notes !== undefined) next.notes = input.notes
  if (input.important !== undefined) next.important = input.important
  if (input.priority !== undefined) next.priority = input.priority
  if (input.dueDate !== undefined) {
    next.dueDate = input.dueDate
    if (input.dueDate === null) {
      next.dueTime = null
      if (input.recurrence === undefined) next.recurrence = null
    }
  }
  if (input.dueTime !== undefined && next.dueDate) next.dueTime = input.dueTime
  if (input.recurrence !== undefined) {
    next.recurrence = input.recurrence && recurrenceInputSchema.parse(input.recurrence)
  }
  if (input.tags !== undefined) next.tags = tagsSchema.parse(input.tags)
  if (input.remindAt !== undefined) next.remindAt = input.remindAt
  if (input.completed !== undefined) {
    next.completedAt = input.completed ? (task.completedAt ?? new Date().toISOString()) : null
  }
  if (input.myDay !== undefined) next.inMyDay = input.myDay
  if (input.placement?.listId) next.listId = input.placement.listId
  if (position) next.position = position
  return next
}

/** A position for a task placed after `afterId` in `tasks` (excluding the task itself). */
export function localPositionAfter(tasks: Task[], movingId: string, afterId: string | null) {
  const ordered = tasks
    .filter((task) => task.id !== movingId && !task.completedAt)
    .sort((a, b) => (a.position < b.position ? -1 : 1))
  const index = afterId === null ? -1 : ordered.findIndex((task) => task.id === afterId)
  const before = index >= 0 ? ordered[index]!.position : null
  const after = ordered[index + 1]?.position ?? null
  try {
    return keyBetween(before, after)
  } catch {
    // Duplicate keys; the server repairs them and sends the real position.
    return undefined
  }
}

/* ── Task mutations ────────────────────────────────────────────── */

export interface UpdateTaskVariables {
  id: string
  input: UpdateTaskInput
  /** Optimistic position when reordering; the server computes the real one. */
  position?: string | undefined
}

export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: UpdateTaskVariables) =>
      api<Task>(`/tasks/${id}`, { method: 'PATCH', body: input }),
    onMutate: async ({ id, input, position }) => {
      const snapshot = await snapshotTasks(queryClient)
      patchCachedTask(queryClient, id, (task) => {
        const next = applyUpdate(task, input, position)
        if (input.assigneeId === undefined) return next
        // The name comes from the list's members, if they are loaded.
        const member = queryClient
          .getQueryData<ListMember[]>(taskKeys.members(task.listId))
          ?.find((item) => item.userId === input.assigneeId)
        return {
          ...next,
          assignee: member ? { id: member.userId, displayName: member.displayName } : null,
        }
      })
      return { snapshot }
    },
    onError: (error, _variables, context) => {
      restore(queryClient, context?.snapshot)
      toast.error(errorMessage(error))
    },
    onSuccess: (task) => patchCachedTask(queryClient, task.id, () => task),
    onSettled: () => refreshTaskData(queryClient),
  })
}

export interface CreateTaskVariables extends CreateTaskInput {
  id: string
}

/** Creates a task; it appears immediately in `optimisticKeys` (e.g. the current list). */
export function useCreateTask(optimisticKeys: QueryKey[] = []) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTaskVariables) =>
      api<Task>('/tasks', { method: 'POST', body: input }),
    onMutate: async (input) => {
      const snapshot = await snapshotTasks(queryClient)
      const lists = queryClient.getQueryData<List[]>(taskKeys.lists)
      const listId = input.listId ?? lists?.find((list) => list.isDefault)?.id
      if (listId) {
        const now = new Date().toISOString()
        for (const key of optimisticKeys) {
          queryClient.setQueryData<Task[]>(key, (tasks) => {
            if (!tasks) return tasks
            const first = tasks
              .filter((task) => !task.completedAt)
              .sort((a, b) => (a.position < b.position ? -1 : 1))[0]
            const optimistic: Task = {
              id: input.id,
              listId,
              title: input.title,
              notes: input.notes ?? '',
              dueDate: input.dueDate ?? null,
              dueTime: input.dueTime ?? null,
              important: input.important ?? false,
              priority: input.priority ?? 0,
              position: keyBetween(null, first?.position ?? null),
              completedAt: null,
              inMyDay: input.myDay ?? false,
              recurrence: input.recurrence ? recurrenceInputSchema.parse(input.recurrence) : null,
              tags: input.tags ? tagsSchema.parse(input.tags) : [],
              assignee: null,
              remindAt: input.remindAt ?? null,
              subtasks: [],
              attachments: [],
              createdAt: now,
              updatedAt: now,
            }
            return [optimistic, ...tasks]
          })
        }
      }
      return { snapshot }
    },
    onError: (error, _input, context) => {
      restore(queryClient, context?.snapshot)
      toast.error(errorMessage(error))
    },
    onSuccess: (task) => patchCachedTask(queryClient, task.id, () => task),
    onSettled: () => refreshTaskData(queryClient),
  })
}

export function newTaskId() {
  return uuidv7()
}

export function useDeleteTask() {
  const queryClient = useQueryClient()
  const restoreTask = useMutation({
    mutationFn: (id: string) => api<Task>(`/tasks/${id}/restore`, { method: 'POST' }),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => refreshTaskData(queryClient),
  })
  return useMutation({
    mutationFn: (task: Task) => api<void>(`/tasks/${task.id}`, { method: 'DELETE' }),
    onMutate: async (task) => {
      const snapshot = await snapshotTasks(queryClient)
      patchCachedTask(queryClient, task.id, () => null)
      return { snapshot }
    },
    onError: (error, _task, context) => {
      restore(queryClient, context?.snapshot)
      toast.error(errorMessage(error))
    },
    onSuccess: (_result, task) => {
      toast({
        title: i18next.t('tasks.deleted', { title: task.title }),
        action: {
          label: i18next.t('common.undo'),
          onClick: () => restoreTask.mutate(task.id),
        },
      })
    },
    onSettled: () => refreshTaskData(queryClient),
  })
}

/* ── Subtask mutations (the server answers with the parent task) ── */

function useSubtaskMutation<T>(
  request: (variables: T) => Promise<Task>,
  optimistic?: (task: Task, variables: T) => Task,
  taskIdOf?: (variables: T) => string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onMutate: async (variables: T) => {
      const snapshot = await snapshotTasks(queryClient)
      if (optimistic && taskIdOf) {
        patchCachedTask(queryClient, taskIdOf(variables), (task) => optimistic(task, variables))
      }
      return { snapshot }
    },
    onError: (error, _variables, context) => {
      restore(queryClient, context?.snapshot)
      toast.error(errorMessage(error))
    },
    onSuccess: (task: Task) => patchCachedTask(queryClient, task.id, () => task),
    onSettled: () => refresh(queryClient, taskKeys.tasks),
  })
}

export function useAddSubtask() {
  return useSubtaskMutation(
    ({ taskId, id, title }: { taskId: string; id: string; title: string }) =>
      api<Task>(`/tasks/${taskId}/subtasks`, { method: 'POST', body: { id, title } }),
    (task, { id, title }) => {
      const last = task.subtasks.at(-1)
      const subtask: Subtask = {
        id,
        title,
        completedAt: null,
        position: keyBetween(last?.position ?? null, null),
      }
      return { ...task, subtasks: [...task.subtasks, subtask] }
    },
    ({ taskId }) => taskId,
  )
}

export function useUpdateSubtask() {
  return useSubtaskMutation(
    ({ id, input }: { taskId: string; id: string; input: UpdateSubtaskInput }) =>
      api<Task>(`/subtasks/${id}`, { method: 'PATCH', body: input }),
    (task, { id, input }) => ({
      ...task,
      subtasks: task.subtasks.map((subtask) =>
        subtask.id === id
          ? {
              ...subtask,
              ...(input.title !== undefined ? { title: input.title } : {}),
              ...(input.completed !== undefined
                ? { completedAt: input.completed ? new Date().toISOString() : null }
                : {}),
            }
          : subtask,
      ),
    }),
    ({ taskId }) => taskId,
  )
}

export function useDeleteSubtask() {
  return useSubtaskMutation(
    ({ id }: { taskId: string; id: string }) => api<Task>(`/subtasks/${id}`, { method: 'DELETE' }),
    (task, { id }) => ({ ...task, subtasks: task.subtasks.filter((subtask) => subtask.id !== id) }),
    ({ taskId }) => taskId,
  )
}

/* ── Attachments ───────────────────────────────────────────────── */

/** Uploads one file; the task is added to the cache with it. */
export function useUploadAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, file }: { taskId: string; file: File }) => {
      const form = new FormData()
      form.append('file', file, file.name)
      return apiUpload<Attachment>(`/tasks/${taskId}/attachments`, form)
    },
    onSuccess: (attachment, { taskId }) =>
      patchCachedTask(queryClient, taskId, (task) => ({
        ...task,
        attachments: [...task.attachments, attachment],
      })),
    onSettled: () => refresh(queryClient, taskKeys.tasks),
  })
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { taskId: string; id: string }) =>
      api<void>(`/attachments/${id}`, { method: 'DELETE' }),
    onMutate: async ({ taskId, id }) => {
      const snapshot = await snapshotTasks(queryClient)
      patchCachedTask(queryClient, taskId, (task) => ({
        ...task,
        attachments: task.attachments.filter((attachment) => attachment.id !== id),
      }))
      return { snapshot }
    },
    onError: (error, _variables, context) => {
      restore(queryClient, context?.snapshot)
      toast.error(errorMessage(error))
    },
    onSettled: () => refresh(queryClient, taskKeys.tasks),
  })
}

/* ── List and group mutations ──────────────────────────────────── */

function useListMutation<TVariables, TResult>(
  request: (variables: TVariables) => Promise<TResult>,
  optimistic?: (queryClient: QueryClient, variables: TVariables) => void,
  onSuccess?: (queryClient: QueryClient, result: TResult) => void,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (result) => onSuccess?.(queryClient, result),
    onMutate: async (variables: TVariables) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.lists })
      await queryClient.cancelQueries({ queryKey: taskKeys.groups })
      const snapshot: Snapshot = [
        [taskKeys.lists, queryClient.getQueryData(taskKeys.lists)],
        [taskKeys.groups, queryClient.getQueryData(taskKeys.groups)],
      ]
      optimistic?.(queryClient, variables)
      return { snapshot }
    },
    onError: (error, _variables, context) => {
      restore(queryClient, context?.snapshot)
      toast.error(errorMessage(error))
    },
    onSettled: () => {
      refresh(queryClient, taskKeys.lists)
      refresh(queryClient, taskKeys.groups)
    },
  })
}

export function useCreateList() {
  return useListMutation(
    (input: CreateListInput) => api<List>('/lists', { method: 'POST', body: input }),
    undefined,
    // Cached right away, so the new list's page can render before the refetch.
    (queryClient, created) =>
      queryClient.setQueryData<List[]>(taskKeys.lists, (lists) =>
        lists && !lists.some((list) => list.id === created.id) ? [...lists, created] : lists,
      ),
  )
}

export interface UpdateListVariables {
  id: string
  input: UpdateListInput
  position?: string | undefined
}

export function useUpdateList() {
  return useListMutation(
    ({ id, input }: UpdateListVariables) =>
      api<List>(`/lists/${id}`, { method: 'PATCH', body: input }),
    (queryClient, { id, input, position }) => {
      queryClient.setQueryData<List[]>(taskKeys.lists, (lists) =>
        lists?.map((list) =>
          list.id === id
            ? {
                ...list,
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.color !== undefined ? { color: input.color } : {}),
                ...(input.icon !== undefined ? { icon: input.icon } : {}),
                ...(input.placement ? { groupId: input.placement.groupId } : {}),
                ...(position ? { position } : {}),
              }
            : list,
        ),
      )
    },
  )
}

export function useDeleteList() {
  const queryClient = useQueryClient()
  return useListMutation(
    (id: string) => api<void>(`/lists/${id}`, { method: 'DELETE' }),
    (client, id) => {
      client.setQueryData<List[]>(taskKeys.lists, (lists) =>
        lists?.filter((list) => list.id !== id),
      )
      refresh(queryClient, taskKeys.tasks)
      refresh(queryClient, taskKeys.counts)
    },
  )
}

export function useDeleteCompleted() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (listId: string) =>
      api<{ deleted: number }>(`/lists/${listId}/completed`, { method: 'DELETE' }),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => refreshTaskData(queryClient),
  })
}

export function useCreateGroup() {
  return useListMutation((input: CreateListGroupInput) =>
    api<ListGroup>('/list-groups', { method: 'POST', body: input }),
  )
}

export interface UpdateGroupVariables {
  id: string
  input: UpdateListGroupInput
  position?: string | undefined
}

export function useUpdateGroup() {
  return useListMutation(
    ({ id, input }: UpdateGroupVariables) =>
      api<ListGroup>(`/list-groups/${id}`, { method: 'PATCH', body: input }),
    (queryClient, { id, input, position }) => {
      queryClient.setQueryData<ListGroup[]>(taskKeys.groups, (groups) =>
        groups?.map((group) =>
          group.id === id
            ? {
                ...group,
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.collapsed !== undefined ? { collapsed: input.collapsed } : {}),
                ...(position ? { position } : {}),
              }
            : group,
        ),
      )
    },
  )
}

export function useDeleteGroup() {
  return useListMutation(
    (id: string) => api<void>(`/list-groups/${id}`, { method: 'DELETE' }),
    (queryClient, id) => {
      queryClient.setQueryData<ListGroup[]>(taskKeys.groups, (groups) =>
        groups?.filter((group) => group.id !== id),
      )
    },
  )
}

/* ── Sharing ───────────────────────────────────────────────────── */

/** Member changes answer with all members; the lists (member counts) refresh after. */
function useMemberMutation<T extends { listId: string }>(
  request: (variables: T) => Promise<ListMember[] | undefined>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (members, { listId }) => {
      if (members) queryClient.setQueryData(taskKeys.members(listId), members)
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => refreshTaskData(queryClient),
  })
}

export function useShareList() {
  return useMemberMutation(
    ({ listId, userId, role }: { listId: string; userId: string; role: ShareRole }) =>
      api<ListMember[]>(`/lists/${listId}/members`, { method: 'POST', body: { userId, role } }),
  )
}

export function useChangeMemberRole() {
  return useMemberMutation(
    ({ listId, userId, role }: { listId: string; userId: string; role: ShareRole }) =>
      api<ListMember[]>(`/lists/${listId}/members/${userId}`, { method: 'PATCH', body: { role } }),
  )
}

/** Removes someone from a list – or, for oneself, leaves it. */
export function useRemoveMember() {
  return useMemberMutation(({ listId, userId }: { listId: string; userId: string }) =>
    api<undefined>(`/lists/${listId}/members/${userId}`, { method: 'DELETE' }),
  )
}
