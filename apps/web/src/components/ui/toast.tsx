import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { Toast as ToastPrimitive } from 'radix-ui'
import { useTranslation } from 'react-i18next'

import { cn } from '../../lib/cn'
import { dismissToast, useToasts } from './toast-store'

export function Toaster() {
  const { t } = useTranslation()
  const list = useToasts()

  return (
    <ToastPrimitive.Provider swipeDirection="down" duration={4500} label={t('common.close')}>
      {list.map((item) => (
        <ToastPrimitive.Root
          key={item.id}
          open={item.open}
          onOpenChange={(open) => {
            if (!open) dismissToast(item.id)
          }}
          type={item.variant === 'error' ? 'foreground' : 'background'}
          className={cn(
            'flex w-full items-start gap-3 rounded-2xl bg-elevated p-3.5 shadow-lg',
            'data-[state=closed]:animate-fade-out data-[state=open]:animate-pop-in',
            'data-[swipe=end]:animate-fade-out data-[swipe=move]:translate-y-(--radix-toast-swipe-move-y)',
          )}
        >
          {item.variant === 'success' && (
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          )}
          {item.variant === 'error' && (
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <ToastPrimitive.Title className="text-callout font-medium">
              {item.title}
            </ToastPrimitive.Title>
            {item.description && (
              <ToastPrimitive.Description className="mt-0.5 text-subhead text-text-secondary">
                {item.description}
              </ToastPrimitive.Description>
            )}
          </div>
          {item.action && (
            <ToastPrimitive.Action
              altText={item.action.label}
              onClick={item.action.onClick}
              className="-my-1 flex h-7 shrink-0 cursor-default items-center rounded-md px-2 text-callout font-semibold text-accent-text hover:bg-fill-hover pointer-coarse:h-11"
            >
              {item.action.label}
            </ToastPrimitive.Action>
          )}
          <ToastPrimitive.Close
            aria-label={t('common.close')}
            className="-m-1 flex size-7 shrink-0 cursor-default items-center justify-center rounded-md text-text-secondary hover:bg-fill-hover hover:text-text"
          >
            <X className="size-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed inset-x-0 bottom-0 z-60 mx-auto flex w-full max-w-sm flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none" />
    </ToastPrimitive.Provider>
  )
}
