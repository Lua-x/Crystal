import { m } from 'motion/react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'
import { springs } from '../../lib/motion'

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
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className={cn('flex flex-col items-center px-6 py-12 text-center', className)}
    >
      <m.div
        initial={{ scale: 0.85 }}
        animate={{ scale: 1 }}
        transition={springs.snappy}
        className="mb-4 flex size-14 items-center justify-center rounded-[18px] bg-accent-soft text-accent-text shadow-xs [&_svg]:size-7"
      >
        {icon}
      </m.div>
      <p className="text-body font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-xs text-callout text-text-secondary">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </m.div>
  )
}
