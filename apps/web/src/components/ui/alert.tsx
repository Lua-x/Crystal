import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

type AlertTone = 'danger' | 'info' | 'success'

interface AlertProps {
  tone?: AlertTone
  children: ReactNode
  className?: string
}

const TONES: Record<AlertTone, { icon: typeof Info; surface: string; iconColor: string }> = {
  danger: { icon: CircleAlert, surface: 'bg-danger-soft', iconColor: 'text-danger' },
  info: { icon: Info, surface: 'bg-accent-soft', iconColor: 'text-accent-text' },
  success: { icon: CircleCheck, surface: 'bg-success-soft', iconColor: 'text-success' },
}

/** An inline message. Errors are announced to screen readers immediately. */
export function Alert({ tone = 'danger', children, className }: AlertProps) {
  const { icon: Icon, surface, iconColor } = TONES[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        // Body text stays in the text color: tinted text on a tinted fill loses contrast.
        'flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-callout text-text',
        surface,
        className,
      )}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', iconColor)} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
