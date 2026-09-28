import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

/*
 * App-wide keyboard shortcuts. Single keys never fire while typing or while a
 * dialog or menu has the focus; ⌘K / Ctrl+K works everywhere.
 */

export type GoTarget =
  '/my-day' | '/important' | '/planned' | '/overdue' | '/all' | '/completed' | '/settings'

/** `G` followed by one of these keys. */
export const GO_KEYS: Record<string, GoTarget> = {
  d: '/my-day',
  i: '/important',
  p: '/planned',
  o: '/overdue',
  a: '/all',
  c: '/completed',
  s: '/settings',
}

const SEQUENCE_TIMEOUT = 1200

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Dialogs and menus handle their own keys. */
function insideOverlay(element: Element | null): boolean {
  return Boolean(
    element?.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'),
  )
}

export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** Focuses the first visible element matching `selector`, retrying while a page renders. */
export function focusWhenReady(selector: string, attempts = 20): void {
  const element = [...document.querySelectorAll<HTMLElement>(selector)].find(
    (candidate) => candidate.offsetParent !== null,
  )
  if (element) element.focus()
  else if (attempts > 0) requestAnimationFrame(() => focusWhenReady(selector, attempts - 1))
}

export const QUICK_ADD_SELECTOR = 'main input[data-quick-add]'
export const SEARCH_SELECTOR = 'input[type="search"]'

function isVisible(selector: string): boolean {
  return [...document.querySelectorAll<HTMLElement>(selector)].some(
    (element) => element.offsetParent !== null,
  )
}

interface ShortcutHandlers {
  onPalette: () => void
  onHelp: () => void
}

export function useGlobalShortcuts({ onPalette, onHelp }: ShortcutHandlers): void {
  const navigate = useNavigate()
  const handlers = useRef({ onPalette, onHelp })
  useEffect(() => {
    handlers.current = { onPalette, onHelp }
  }, [onPalette, onHelp])

  useEffect(() => {
    let awaitingGo = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      const key = event.key.toLowerCase()

      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && key === 'k') {
        event.preventDefault()
        handlers.current.onPalette()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target) || insideOverlay(document.activeElement)) return

      if (awaitingGo) {
        awaitingGo = false
        clearTimeout(timer)
        const target = GO_KEYS[key]
        if (target) {
          event.preventDefault()
          void navigate({ to: target })
        }
        return
      }

      switch (event.key) {
        case 'g':
        case 'G':
          awaitingGo = true
          timer = setTimeout(() => (awaitingGo = false), SEQUENCE_TIMEOUT)
          return
        case 'n':
        case 'N':
          event.preventDefault()
          // Pages without an "Add a task" field send you to My Day.
          if (isVisible(QUICK_ADD_SELECTOR)) focusWhenReady(QUICK_ADD_SELECTOR)
          else void navigate({ to: '/my-day' }).then(() => focusWhenReady(QUICK_ADD_SELECTOR))
          return
        case '/':
          event.preventDefault()
          if (isVisible(SEARCH_SELECTOR)) focusWhenReady(SEARCH_SELECTOR)
          else void navigate({ to: '/search' }).then(() => focusWhenReady(SEARCH_SELECTOR))
          return
        case '?':
          event.preventDefault()
          handlers.current.onHelp()
          return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearTimeout(timer)
    }
  }, [navigate])
}
