import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

interface EmptyStateProps {
  icon: ReactNode
  title: ReactNode
  body?: ReactNode
  action?: ReactNode
  className?: string
}

/** A friendly, brief placeholder for empty views – never just blank space. */
export function EmptyState({ icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-text [&_svg]:size-6">
        {icon}
      </div>
      <p className="text-body font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-xs text-callout text-text-secondary">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
