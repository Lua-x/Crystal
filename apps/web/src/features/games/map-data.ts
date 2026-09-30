import type { GameMap, UpdateMapInput } from '@crystal/shared'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { api, apiUpload } from '../../lib/api'
import { refreshTaskData } from '../tasks/data'

export const mapKeys = {
  all: ['maps'] as const,
  ofList: (listId: string) => ['maps', listId] as const,
}

export function mapsQuery(listId: string) {
  return queryOptions({
    queryKey: mapKeys.ofList(listId),
    queryFn: () => api<GameMap[]>(`/lists/${listId}/maps`),
  })
}

export function useAddMap() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ listId, name, file }: { listId: string; name: string; file: File }) => {
      const form = new FormData()
      form.append('name', name)
      form.append('file', file)
      return apiUpload<GameMap>(`/lists/${listId}/maps`, form)
    },
    onSuccess: (map) =>
      queryClient.setQueryData<GameMap[]>(mapKeys.ofList(map.listId), (maps) =>
        maps ? [...maps, map] : [map],
      ),
    onSettled: (_map, _error, { listId }) =>
      queryClient.invalidateQueries({ queryKey: mapKeys.ofList(listId) }),
  })
}

export function useRenameMap() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ map, input }: { map: GameMap; input: UpdateMapInput }) =>
      api<GameMap>(`/maps/${map.id}`, { method: 'PATCH', body: input }),
    onSuccess: (updated) =>
      queryClient.setQueryData<GameMap[]>(mapKeys.ofList(updated.listId), (maps) =>
        maps?.map((item) => (item.id === updated.id ? updated : item)),
      ),
  })
}

export function useDeleteMap() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (map: GameMap) => api<void>(`/maps/${map.id}`, { method: 'DELETE' }),
    onSuccess: (_result, map) => {
      queryClient.setQueryData<GameMap[]>(mapKeys.ofList(map.listId), (maps) =>
        maps?.filter((item) => item.id !== map.id),
      )
      // Goals pinned to it lost their place.
      refreshTaskData(queryClient)
    },
  })
}
