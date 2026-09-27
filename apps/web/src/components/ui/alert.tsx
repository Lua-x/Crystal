import { CircleAlert, Info } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

interface AlertProps {
  tone?: 'danger' | 'info'
  children: ReactNode
  className?: string
}

/** An inline message. Errors are announced to screen readers immediately. */
export function Alert({ tone = 'danger', children, className }: AlertProps) {
  const Icon = tone === 'danger' ? CircleAlert : Info
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-callout',
        // Body text stays in the text color: tinted text on a tinted fill loses contrast.
        tone === 'danger' ? 'bg-danger-soft text-text' : 'bg-accent-soft text-text',
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0',
          tone === 'danger' ? 'text-danger' : 'text-accent-text',
        )}
      />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
