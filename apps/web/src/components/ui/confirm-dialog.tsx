import { AnimatePresence, m } from 'motion/react'
import { AlertDialog } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { springs } from '../../lib/motion'
import { Button } from './button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  confirmLabel: ReactNode
  destructive?: boolean
  /** May return a promise; the dialog stays open (and busy) until it settles. */
  onConfirm: () => unknown
}

/** Asks before something irreversible happens. Focus starts on "Cancel". */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // The caller reports the error (e.g. with a toast); keep the dialog open.
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <AlertDialog.Portal forceMount>
            <AlertDialog.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-40 bg-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            </AlertDialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6">
              <AlertDialog.Content asChild forceMount>
                <m.div
                  className="pointer-events-auto w-full max-w-sm rounded-2xl bg-elevated p-5 text-center shadow-lg outline-none"
                  initial={{ opacity: 0, scale: 1.04 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
                  transition={springs.gentle}
                >
                  <AlertDialog.Title className="text-body font-semibold">{title}</AlertDialog.Title>
                  <AlertDialog.Description className="mt-1.5 text-callout text-text-secondary">
                    {description}
                  </AlertDialog.Description>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <AlertDialog.Cancel asChild>
                      <Button variant="secondary">{t('common.cancel')}</Button>
                    </AlertDialog.Cancel>
                    <Button
                      variant={destructive ? 'destructive' : 'primary'}
                      loading={busy}
                      onClick={() => void confirm()}
                    >
                      {confirmLabel}
                    </Button>
                  </div>
                </m.div>
              </AlertDialog.Content>
            </div>
          </AlertDialog.Portal>
        )}
      </AnimatePresence>
    </AlertDialog.Root>
  )
}
