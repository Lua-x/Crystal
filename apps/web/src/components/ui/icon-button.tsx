import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'
import { Tooltip } from './tooltip'

export interface IconButtonProps extends ComponentProps<'button'> {
  /** Accessible name, also shown as tooltip. */
  label: string
  showTooltip?: boolean
}

/** A square, borderless button that shows only an icon. */
export function IconButton({
  label,
  showTooltip = true,
  className,
  children,
  type = 'button',
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex size-8 shrink-0 cursor-default items-center justify-center rounded-lg text-text-secondary',
        'transition-[background-color,color,scale] duration-150 ease-out hover:bg-fill-hover hover:text-text active:scale-95 active:bg-fill-pressed',
        'disabled:pointer-events-none disabled:opacity-45 pointer-coarse:size-11 [&_svg]:size-4.5',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
  return showTooltip ? <Tooltip content={label}>{button}</Tooltip> : button
}
