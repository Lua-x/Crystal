import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../lib/cn'
import { springs } from '../../lib/motion'
import { IconButton } from './icon-button'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  className?: string
}

/**
 * A centered dialog on larger screens and a bottom sheet on phones. Focus is
 * trapped inside and returns to the trigger when it closes.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const { t } = useTranslation()
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            </DialogPrimitive.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
              <DialogPrimitive.Content
                asChild
                forceMount
                onOpenAutoFocus={(event) => {
                  // Start in the first field rather than on the close button.
                  const field = (
                    event.currentTarget as HTMLElement | null
                  )?.querySelector<HTMLElement>(
                    'input:not([type=hidden]):not([readonly]), select, textarea',
                  )
                  if (field) {
                    event.preventDefault()
                    field.focus()
                  }
                }}
              >
                <motion.div
                  className={cn(
                    'pointer-events-auto flex max-h-[90dvh] w-full flex-col overflow-hidden bg-elevated shadow-lg outline-none',
                    'rounded-t-3xl pb-[env(safe-area-inset-bottom)] sm:max-w-md sm:rounded-2xl sm:pb-0',
                    className,
                  )}
                  initial={{ opacity: 0, y: 24, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.14 } }}
                  transition={springs.gentle}
                >
                  <div className="flex items-start gap-3 px-5 pt-5 pb-3">
                    <div className="min-w-0 flex-1">
                      <DialogPrimitive.Title className="text-title3 font-semibold">
                        {title}
                      </DialogPrimitive.Title>
                      {description ? (
                        <DialogPrimitive.Description className="mt-1 text-callout text-text-secondary">
                          {description}
                        </DialogPrimitive.Description>
                      ) : (
                        <DialogPrimitive.Description className="sr-only">
                          {title}
                        </DialogPrimitive.Description>
                      )}
                    </div>
                    <DialogPrimitive.Close asChild>
                      <IconButton
                        label={t('common.close')}
                        showTooltip={false}
                        className="-mt-1 -mr-2"
                      >
                        <X />
                      </IconButton>
                    </DialogPrimitive.Close>
                  </div>
                  {children && <div className="overflow-y-auto px-5 pb-5">{children}</div>}
                  {footer && (
                    <div className="flex flex-col-reverse gap-2 px-5 pb-5 sm:flex-row sm:justify-end">
                      {footer}
                    </div>
                  )}
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}
