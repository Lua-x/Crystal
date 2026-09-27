import { DropdownMenu as Menu } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../lib/cn'

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'start',
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(
          'z-50 min-w-52 origin-(--radix-dropdown-menu-content-transform-origin) rounded-xl bg-elevated p-1 shadow-md',
          'data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  )
}

interface ItemProps extends ComponentProps<typeof Menu.Item> {
  icon?: ReactNode
  destructive?: boolean
}

/** Highlighted items use the accent fill, like native macOS menus. */
export function DropdownMenuItem({ className, icon, destructive, children, ...props }: ItemProps) {
  return (
    <Menu.Item
      className={cn(
        'flex h-8 cursor-default items-center gap-2.5 rounded-md px-2 text-callout outline-none select-none pointer-coarse:h-11',
        'data-disabled:opacity-45 data-highlighted:bg-accent data-highlighted:text-on-accent',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        destructive
          ? 'text-danger data-highlighted:bg-danger-fill data-highlighted:text-on-danger'
          : 'text-text',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </Menu.Item>
  )
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return (
    <Menu.Label
      className={cn('truncate px-2 pt-1.5 pb-1 text-footnote text-text-secondary', className)}
      {...props}
    />
  )
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className="mx-2 my-1 h-px bg-separator" />
}
