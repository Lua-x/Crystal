import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'
import { Spinner } from './spinner'

const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 cursor-default items-center justify-center gap-1.5 font-medium whitespace-nowrap select-none',
    'transition-[background-color,color,box-shadow,opacity,scale] duration-150 ease-out active:scale-98',
    'disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-on-accent shadow-xs hover:bg-accent-hover active:bg-accent-pressed',
        secondary: 'bg-fill-control text-text hover:bg-fill-pressed',
        plain: 'text-accent-text hover:bg-fill-hover active:bg-fill-pressed',
        ghost: 'text-text hover:bg-fill-hover active:bg-fill-pressed',
        destructive: 'bg-danger-fill text-on-danger shadow-xs hover:opacity-90',
        'destructive-plain': 'text-danger hover:bg-danger-soft',
      },
      size: {
        sm: 'h-7 rounded-md px-2.5 text-subhead pointer-coarse:min-h-11',
        md: 'h-8 rounded-lg px-3.5 text-callout pointer-coarse:min-h-11',
        lg: 'h-11 rounded-xl px-5 text-body',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild,
  loading = false,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot.Root>
    )
  }
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner className="absolute" />}
      <span className={cn('inline-flex items-center gap-1.5', loading && 'invisible')}>
        {children}
      </span>
    </button>
  )
}
