import { m } from 'motion/react'
import { Checkbox } from 'radix-ui'

import { cn } from '../../lib/cn'
import { springs } from '../../lib/motion'

interface TaskCheckboxProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  size?: 'md' | 'sm'
  disabled?: boolean
  className?: string
}

/**
 * The round checkbox of a task. The check mark draws itself with a short
 * spring; with reduced motion it simply appears.
 */
export function TaskCheckbox({
  checked,
  onCheckedChange,
  label,
  size = 'md',
  disabled,
  className,
}: TaskCheckboxProps) {
  return (
    <Checkbox.Root
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        // A larger hit area around the visible circle (44 px on touch screens).
        'group relative flex shrink-0 cursor-default items-center justify-center rounded-full',
        size === 'md' ? 'size-8 pointer-coarse:size-11' : 'size-7 pointer-coarse:size-10',
        className,
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full border-[1.5px] transition-colors duration-150',
          size === 'md' ? 'size-5' : 'size-4',
          checked
            ? 'border-accent bg-accent text-on-accent'
            : 'border-border-control group-hover:border-accent-text',
        )}
      >
        <svg viewBox="0 0 16 16" aria-hidden className={size === 'md' ? 'size-3.5' : 'size-3'}>
          <m.path
            d="M3.5 8.5 6.5 11.5 12.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={springs.snappy}
          />
        </svg>
      </span>
    </Checkbox.Root>
  )
}
