import { Switch as SwitchPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 cursor-default items-center rounded-full bg-fill-pressed p-0.5',
        'transition-colors duration-200 ease-out data-[state=checked]:bg-accent',
        'disabled:opacity-45',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block size-5 rounded-full bg-knob shadow-sm transition-transform duration-200 ease-out',
          'data-[state=checked]:translate-x-4',
        )}
      />
    </SwitchPrimitive.Root>
  )
}
