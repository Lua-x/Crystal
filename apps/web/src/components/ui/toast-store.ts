import { useSyncExternalStore } from 'react'

export type ToastVariant = 'default' | 'success' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: number
  title: string
  description?: string | undefined
  variant: ToastVariant
  action?: ToastAction | undefined
  open: boolean
}

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()

function setItems(next: ToastItem[]) {
  items = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, () => items)
}

interface ToastInput {
  title: string
  description?: string
  variant?: ToastVariant
  /** For example "Undo". */
  action?: ToastAction
}

/** Shows a short, non-blocking message. At most three are visible at once. */
export function toast({ title, description, variant = 'default', action }: ToastInput) {
  setItems([...items.slice(-2), { id: nextId++, title, description, variant, action, open: true }])
}
toast.success = (title: string, description?: string) =>
  toast({ title, variant: 'success', ...(description ? { description } : {}) })
toast.error = (title: string, description?: string) =>
  toast({ title, variant: 'error', ...(description ? { description } : {}) })

export function dismissToast(id: number) {
  setItems(items.map((item) => (item.id === id ? { ...item, open: false } : item)))
  // Keep the element around until the exit animation has finished.
  setTimeout(() => setItems(items.filter((item) => item.id !== id)), 300)
}
