import type { InstanceMode } from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'

import { authConfigQuery } from './queries'

const STORAGE_KEY = 'crystal.mode'

/**
 * The mode seen last time. It picks the right words before the server has
 * answered – and offline, when it cannot answer.
 */
export function cachedMode(): InstanceMode | undefined {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'standard' || value === 'gaming' ? value : undefined
  } catch {
    return undefined
  }
}

export function rememberMode(mode: InstanceMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Storage may be unavailable (private mode); the words then follow the server.
  }
}

/** What this instance is for: everyday lists or games. */
export function useInstanceMode(): InstanceMode {
  const { data } = useQuery(authConfigQuery)
  return data?.mode ?? cachedMode() ?? 'standard'
}

export function useIsGaming(): boolean {
  return useInstanceMode() === 'gaming'
}
