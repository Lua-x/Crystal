import { m } from 'motion/react'
import { RadioGroup } from 'radix-ui'
import { useId, type ReactNode } from 'react'

import { cn } from '../../lib/cn'
import { springs } from '../../lib/motion'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
}

interface SegmentedControlProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: SegmentedOption<T>[]
  'aria-label'?: string
  'aria-labelledby'?: string
  className?: string
}

/** Apple-style segmented control; a radio group for assistive technology. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const layoutId = useId()
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      orientation="horizontal"
      className={cn(
        'inline-grid auto-cols-fr grid-flow-col rounded-lg bg-fill-control p-0.5',
        className,
      )}
      {...aria}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            className={cn(
              'relative flex h-7 cursor-default items-center justify-center gap-1.5 rounded-md px-3 text-subhead font-medium outline-offset-0',
              'transition-colors duration-150 pointer-coarse:h-10 [&_svg]:size-4',
              // All labels keep full contrast; the raised segment marks the selection.
              'text-text',
            )}
          >
            {selected && (
              <m.span
                layoutId={layoutId}
                transition={springs.snappy}
                className="absolute inset-0 rounded-md bg-segment shadow-sm"
                aria-hidden
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {option.icon}
              {option.label}
            </span>
          </RadioGroup.Item>
        )
      })}
    </RadioGroup.Root>
  )
}
