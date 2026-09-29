import type {
  CreateChannelInput,
  NotificationChannel,
  PushStatus,
  UpdateChannelInput,
} from '@crystal/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'

export const notificationKeys = {
  channels: ['notifications', 'channels'] as const,
  push: ['notifications', 'push'] as const,
}

export const channelsQuery = queryOptions({
  queryKey: notificationKeys.channels,
  queryFn: () => api<NotificationChannel[]>('/notifications/channels'),
})

export const pushStatusQuery = queryOptions({
  queryKey: notificationKeys.push,
  queryFn: () => api<PushStatus>('/notifications/push'),
})

function useInvalidate(queryKey: readonly string[]) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey })
}

export function useCreateChannel() {
  const invalidate = useInvalidate(notificationKeys.channels)
  return useMutation({
    mutationFn: (input: CreateChannelInput) =>
      api<NotificationChannel>('/notifications/channels', { method: 'POST', body: input }),
    onSettled: invalidate,
  })
}

export function useUpdateChannel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateChannelInput }) =>
      api<NotificationChannel>(`/notifications/channels/${id}`, { method: 'PATCH', body: input }),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.channels })
      queryClient.setQueryData<NotificationChannel[]>(notificationKeys.channels, (channels) =>
        channels?.map((channel) => (channel.id === id ? { ...channel, ...input } : channel)),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.channels }),
  })
}

export function useDeleteChannel() {
  const invalidate = useInvalidate(notificationKeys.channels)
  return useMutation({
    mutationFn: (id: string) => api<void>(`/notifications/channels/${id}`, { method: 'DELETE' }),
    onSettled: invalidate,
  })
}

/** Sends a test message; the channel's status (last sent, last error) changes either way. */
export function useTestChannel() {
  const invalidate = useInvalidate(notificationKeys.channels)
  return useMutation({
    mutationFn: (id: string) =>
      api<NotificationChannel>(`/notifications/channels/${id}/test`, { method: 'POST' }),
    onSettled: invalidate,
  })
}

export function useRemovePushDevice() {
  const invalidate = useInvalidate(notificationKeys.push)
  return useMutation({
    mutationFn: (id: string) => api<void>(`/notifications/push/${id}`, { method: 'DELETE' }),
    onSettled: invalidate,
  })
}

export function useTestPush() {
  const invalidate = useInvalidate(notificationKeys.push)
  return useMutation({
    mutationFn: () => api<void>('/notifications/push/test', { method: 'POST' }),
    onSettled: invalidate,
  })
}

/**
 * Whether notifications can reach the user at all: a browser with push, or an
 * enabled channel. Only asked for when it matters (e.g. a reminder is set).
 */
export function useCanBeNotified(enabled: boolean): boolean | undefined {
  const push = useQuery({ ...pushStatusQuery, enabled, staleTime: 5 * 60_000 })
  const channels = useQuery({ ...channelsQuery, enabled, staleTime: 5 * 60_000 })
  if (!push.data || !channels.data) return undefined
  return push.data.devices.length > 0 || channels.data.some((channel) => channel.enabled)
}
