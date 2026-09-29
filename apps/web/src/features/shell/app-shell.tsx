import { Outlet } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../lib/cn'
import { springs } from '../../lib/motion'
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/use-media-query'
import { useNotificationClicks } from '../notifications/use-notification-clicks'
import { DndProvider } from '../tasks/dnd-provider'
import { GroupDialog, ListDialog } from '../tasks/list-dialogs'
import { TaskDetailHost } from '../tasks/task-detail-host'
import { CommandPalette } from './command-palette'
import { useLiveUpdates } from './live-updates'
import { ShellContext, type ShellState } from './shell-context'
import { useGlobalShortcuts } from './shortcuts'
import { ShortcutsDialog } from './shortcuts-dialog'
import { Sidebar } from './sidebar'

const COLLAPSED_KEY = 'crystal.sidebarCollapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Sidebar on the left, content in the middle. On phones the sidebar becomes a
 * sheet that slides in from the left.
 */
export function AppShell() {
  const { t } = useTranslation()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const toggleSidebar = useCallback(() => {
    if (!isDesktop) {
      setDrawerOpen((open) => !open)
      return
    }
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1')
      } catch {
        // Not critical.
      }
      return !value
    })
  }, [isDesktop])

  const [overlay, setOverlay] = useState<'palette' | 'shortcuts' | 'list' | 'group' | null>(null)
  const openPalette = useCallback(() => setOverlay('palette'), [])
  const openShortcuts = useCallback(() => setOverlay('shortcuts'), [])
  // ⌘K / Ctrl+K opens the palette and closes it again.
  const togglePalette = useCallback(
    () => setOverlay((current) => (current === 'palette' ? null : 'palette')),
    [],
  )
  useGlobalShortcuts({ onPalette: togglePalette, onHelp: openShortcuts })
  useLiveUpdates()
  useNotificationClicks()
  const overlayProps = (name: NonNullable<typeof overlay>) => ({
    open: overlay === name,
    onOpenChange: (open: boolean) => setOverlay(open ? name : null),
  })

  const shell = useMemo<ShellState>(
    () => ({
      isCompact: !isDesktop,
      sidebarOpen: isDesktop ? !collapsed : drawerOpen,
      toggleSidebar,
      openPalette,
      openShortcuts,
    }),
    [isDesktop, collapsed, drawerOpen, toggleSidebar, openPalette, openShortcuts],
  )

  return (
    <ShellContext.Provider value={shell}>
      <CommandPalette
        {...overlayProps('palette')}
        onShowShortcuts={openShortcuts}
        onNewList={() => setOverlay('list')}
        onNewGroup={() => setOverlay('group')}
      />
      <ShortcutsDialog {...overlayProps('shortcuts')} />
      <ListDialog {...overlayProps('list')} />
      <GroupDialog {...overlayProps('group')} />
      <DndProvider>
        <div className="flex h-dvh overflow-hidden">
          {isDesktop ? (
            <aside
              aria-label={t('shell.sidebar')}
              className={cn(
                'flex shrink-0 flex-col overflow-hidden hairline-r material-sidebar',
                'transition-[width] duration-300 ease-out motion-reduce:transition-none',
                collapsed ? 'w-0' : 'w-64',
              )}
              inert={collapsed || undefined}
            >
              <div className="flex h-full w-64 flex-col">
                <Sidebar />
              </div>
            </aside>
          ) : (
            <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
              <AnimatePresence>
                {drawerOpen && (
                  <DialogPrimitive.Portal forceMount>
                    <DialogPrimitive.Overlay asChild forceMount>
                      <motion.div
                        className="fixed inset-0 z-40 bg-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      />
                    </DialogPrimitive.Overlay>
                    <DialogPrimitive.Content
                      asChild
                      forceMount
                      aria-describedby={undefined}
                      onOpenAutoFocus={(event) => {
                        // Focusing the search field would pop up the on-screen keyboard;
                        // start at the current page's entry instead.
                        event.preventDefault()
                        const drawer = event.currentTarget as HTMLElement
                        const current = drawer.querySelector<HTMLElement>('[data-status="active"]')
                        ;(current ?? drawer).focus()
                      }}
                    >
                      <motion.div
                        className="fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] flex-col bg-sidebar-solid pt-[env(safe-area-inset-top)] shadow-lg outline-none"
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={springs.gentle}
                      >
                        <DialogPrimitive.Title className="sr-only">
                          {t('shell.sidebar')}
                        </DialogPrimitive.Title>
                        {/* Close the drawer once a destination was picked. */}
                        <Sidebar onNavigate={() => setDrawerOpen(false)} />
                      </motion.div>
                    </DialogPrimitive.Content>
                  </DialogPrimitive.Portal>
                )}
              </AnimatePresence>
            </DialogPrimitive.Root>
          )}
          <main className="relative flex min-w-0 flex-1 flex-col bg-canvas">
            <Outlet />
          </main>
          <TaskDetailHost />
        </div>
      </DndProvider>
    </ShellContext.Provider>
  )
}
