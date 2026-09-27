import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

const badgeVariants = cva(
  'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-caption font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        // The tint carries the meaning; the label keeps full text contrast.
        neutral: 'bg-fill-control text-text',
        accent: 'bg-accent-soft text-text',
        success: 'bg-success-soft text-text',
        warning: 'bg-warning-soft text-text',
        danger: 'bg-danger-soft text-text',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
