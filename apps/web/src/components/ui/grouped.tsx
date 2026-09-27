import { useId, type ReactNode } from 'react'

import { cn } from '../../lib/cn'

interface GroupedSectionProps {
  title?: ReactNode
  footer?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** An inset, rounded group of rows with an optional heading, like iOS settings. */
export function GroupedSection({
  title,
  footer,
  actions,
  children,
  className,
}: GroupedSectionProps) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cn('flex flex-col gap-2', className)}
    >
      {(title || actions) && (
        <div className="flex min-h-7 items-end justify-between gap-3 px-1">
          {title && (
            <h2 id={headingId} className="text-subhead font-semibold text-text-secondary">
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      <div className="divide-y divide-separator overflow-hidden rounded-xl bg-cell shadow-sm">
        {children}
      </div>
      {footer && <p className="px-1 text-footnote text-text-secondary">{footer}</p>}
    </section>
  )
}

interface GroupedRowProps {
  label?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  children?: ReactNode
  className?: string
}

/** A row inside a `GroupedSection`: label and description left, control right. */
export function GroupedRow({ label, description, icon, children, className }: GroupedRowProps) {
  return (
    <div className={cn('flex min-h-12 items-center gap-3 px-4 py-2.5', className)}>
      {icon && <span className="flex shrink-0 text-text-secondary [&_svg]:size-5">{icon}</span>}
      {(label || description) && (
        <div className="min-w-0 flex-1">
          {label && <div className="text-body">{label}</div>}
          {description && <div className="text-subhead text-text-secondary">{description}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
