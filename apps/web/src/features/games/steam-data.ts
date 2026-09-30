import type {
  ImportSteamGameInput,
  LinkSteamInput,
  List,
  SteamGame,
  SteamStatus,
  SteamSyncResult,
} from '@crystal/shared'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import { refreshTaskData, taskKeys } from '../tasks/data'

export const steamKeys = {
  status: ['steam'] as const,
  games: ['steam', 'games'] as const,
}

export const steamStatusQuery = queryOptions({
  queryKey: steamKeys.status,
  queryFn: () => api<SteamStatus>('/steam'),
  staleTime: 5 * 60_000,
})

/** The linked library. Every load asks Steam, so it is kept for a while. */
export const steamGamesQuery = queryOptions({
  queryKey: steamKeys.games,
  queryFn: () => api<SteamGame[]>('/steam/games'),
  staleTime: 10 * 60_000,
  retry: false,
})

export function useLinkSteam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LinkSteamInput) =>
      api<SteamStatus>('/steam/profile', { method: 'PUT', body: input }),
    onSuccess: (status) => {
      queryClient.setQueryData(steamKeys.status, status)
      queryClient.removeQueries({ queryKey: steamKeys.games })
    },
  })
}

export function useUnlinkSteam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<SteamStatus>('/steam/profile', { method: 'DELETE' }),
    onSuccess: (status) => {
      queryClient.setQueryData(steamKeys.status, status)
      queryClient.removeQueries({ queryKey: steamKeys.games })
    },
  })
}

export function useImportSteamGame() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ImportSteamGameInput) =>
      api<List>('/steam/games', { method: 'POST', body: input }),
    onSuccess: (game) => {
      queryClient.setQueryData<List[]>(taskKeys.lists, (lists) =>
        lists && !lists.some((list) => list.id === game.id) ? [...lists, game] : lists,
      )
      queryClient.setQueryData<SteamGame[]>(steamKeys.games, (games) =>
        games?.map((item) =>
          item.appId === game.steamAppId ? { ...item, listId: game.id } : item,
        ),
      )
      refreshTaskData(queryClient)
    },
  })
}

export function useSteamSync() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (listId: string) =>
      api<SteamSyncResult>(`/lists/${listId}/steam-sync`, { method: 'POST' }),
    onSettled: () => refreshTaskData(queryClient),
  })
}
