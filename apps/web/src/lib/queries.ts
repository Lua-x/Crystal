import type {
  AdminUpdateUserInput,
  AdminUser,
  AuthConfig,
  ChangePasswordInput,
  CreatedInvite,
  CreateInviteInput,
  Invite,
  InvitePreview,
  LoginInput,
  Me,
  RegisterInput,
  SessionInfo,
  UpdateMeInput,
} from '@crystal/shared'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { api, ApiError } from './api'
import { offlineCache } from './offline-cache'

export const queryKeys = {
  authConfig: ['auth-config'] as const,
  me: ['me'] as const,
  sessions: ['me', 'sessions'] as const,
  adminUsers: ['admin', 'users'] as const,
  adminInvites: ['admin', 'invites'] as const,
  invite: (token: string) => ['invite', token] as const,
}

export const authConfigQuery = queryOptions({
  queryKey: queryKeys.authConfig,
  queryFn: () => api<AuthConfig>('/auth/config'),
  staleTime: 5 * 60_000,
})

/** The signed-in user, or `null` when signed out. */
export const meQuery = queryOptions({
  queryKey: queryKeys.me,
  queryFn: async () => {
    try {
      return await api<Me>('/me')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },
  staleTime: 60_000,
})

export const sessionsQuery = queryOptions({
  queryKey: queryKeys.sessions,
  queryFn: () => api<SessionInfo[]>('/me/sessions'),
})

export const adminUsersQuery = queryOptions({
  queryKey: queryKeys.adminUsers,
  queryFn: () => api<AdminUser[]>('/admin/users'),
})

export const adminInvitesQuery = queryOptions({
  queryKey: queryKeys.adminInvites,
  queryFn: () => api<Invite[]>('/admin/invites'),
})

export const invitePreviewQuery = (token: string) =>
  queryOptions({
    queryKey: queryKeys.invite(token),
    queryFn: () => api<InvitePreview>(`/invites/${encodeURIComponent(token)}`),
    retry: false,
  })

/* ── Mutations ─────────────────────────────────────────────── */

function useSetMe() {
  const queryClient = useQueryClient()
  return (me: Me | null) => {
    queryClient.setQueryData(queryKeys.me, me)
  }
}

export function useLogin() {
  const setMe = useSetMe()
  return useMutation({
    mutationFn: (input: LoginInput) => api<Me>('/auth/login', { method: 'POST', body: input }),
    onSuccess: setMe,
  })
}

export function useRegister() {
  const setMe = useSetMe()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      api<Me>('/auth/register', { method: 'POST', body: input }),
    onSuccess: (me) => {
      setMe(me)
      void queryClient.invalidateQueries({ queryKey: queryKeys.authConfig })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      // Drop every cached query so nothing of this account survives the logout,
      // including the copy kept for offline use.
      queryClient.clear()
      void offlineCache.removeClient()
      queryClient.setQueryData(queryKeys.me, null)
    },
  })
}

/** Updates the profile optimistically, so appearance changes apply instantly. */
export function useUpdateMe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateMeInput) => api<Me>('/me', { method: 'PATCH', body: input }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.me })
      const previous = queryClient.getQueryData<Me | null>(queryKeys.me)
      if (previous && (input.preferences || input.locale)) {
        queryClient.setQueryData<Me>(queryKeys.me, {
          ...previous,
          ...(input.locale ? { locale: input.locale } : {}),
          preferences: { ...previous.preferences, ...input.preferences },
        })
      }
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(queryKeys.me, context.previous)
    },
    onSuccess: (me) => queryClient.setQueryData(queryKeys.me, me),
  })
}

export function useChangePassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      api<void>('/me/password', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me })
    },
  })
}

export function useRevokeSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/me/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
  })
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/me/sessions', { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
  })
}

export function useUnlinkSso() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/me/identities/oidc', { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  })
}

export function useAdminUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminUpdateUserInput }) =>
      api<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers }),
  })
}

export function useAdminDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers }),
  })
}

export function useCreateInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateInviteInput) =>
      api<CreatedInvite>('/admin/invites', { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminInvites }),
  })
}

export function useRevokeInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/invites/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminInvites }),
  })
}
