import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useTranslation } from 'react-i18next'

import { springs } from '../../lib/motion'
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/use-media-query'
import { useTaskSelection } from './hooks'
import { TaskDetail } from './task-detail'

/** From this width on, details sit next to the list; below, they open as a sheet. */
const PANEL_QUERY = '(min-width: 1024px)'

/**
 * Shows the task from `?task=…`: as a panel on the right on wide screens, as
 * a bottom sheet on phones and tablets.
 */
export function TaskDetailHost() {
  const { t } = useTranslation()
  const { selectedId, close } = useTaskSelection()
  const asPanel = useMediaQuery(PANEL_QUERY)
  const sideSheet = useMediaQuery(DESKTOP_QUERY)
  const dragControls = useDragControls()
  const hidden = sideSheet ? { x: '100%' } : { y: '100%' }

  if (asPanel) {
    return (
      <AnimatePresence initial={false}>
        {selectedId && (
          <motion.aside
            key="task-detail"
            aria-label={t('detail.label')}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 384, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={springs.gentle}
            onKeyDown={(event) => {
              if (event.key === 'Escape') close()
            }}
            className="shrink-0 overflow-hidden bg-grouped hairline-l"
          >
            <div className="h-full w-96">
              <TaskDetail taskId={selectedId} onClose={close} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    )
  }

  return (
    <DialogPrimitive.Root
      open={Boolean(selectedId)}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <AnimatePresence>
        {selectedId && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed inset-x-0 bottom-0 z-50 flex h-[92dvh] flex-col rounded-t-3xl bg-grouped pb-[env(safe-area-inset-bottom)] shadow-lg outline-none md:inset-x-auto md:inset-y-0 md:right-0 md:h-full md:w-md md:rounded-none md:rounded-l-3xl"
                initial={hidden}
                animate={{ x: 0, y: 0 }}
                exit={hidden}
                transition={springs.gentle}
                drag={sideSheet ? false : 'y'}
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={(_event, info) => {
                  // Swiping the sheet down closes it, as on iOS.
                  if (info.offset.y > 120 || info.velocity.y > 600) close()
                }}
              >
                {/* Only the grabber starts the swipe, so scrolling and text selection keep working. */}
                <div
                  aria-hidden
                  onPointerDown={(event) => dragControls.start(event)}
                  className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center md:hidden"
                >
                  <span className="h-1.5 w-10 rounded-full bg-fill-pressed" />
                </div>
                <DialogPrimitive.Title className="sr-only">
                  {t('detail.label')}
                </DialogPrimitive.Title>
                <div className="min-h-0 flex-1">
                  <TaskDetail taskId={selectedId} onClose={close} />
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}
