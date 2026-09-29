import { useSyncExternalStore } from 'react'

const TICK_MS = 30_000

const listeners = new Set<() => void>()
let current = Date.now()
let timer: ReturnType<typeof setInterval> | undefined

function tick() {
  current = Date.now()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (timer === undefined) {
    // The clock only runs while someone looks at it; catch up when it starts again.
    current = Date.now()
    timer = setInterval(tick, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

const snapshot = () => current

/**
 * The current time in milliseconds, updated every 30 seconds – for things
 * like "is this reminder still ahead?". One timer serves every component.
 */
export function useClock(): number {
  return useSyncExternalStore(subscribe, snapshot)
}
