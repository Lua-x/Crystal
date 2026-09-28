import { ContextMenu as Menu } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../lib/cn'

export const ContextMenu = Menu.Root
export const ContextMenuTrigger = Menu.Trigger

const contentClassName = cn(
  'z-50 min-w-52 rounded-xl bg-elevated p-1 shadow-md',
  'data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in',
)

export function ContextMenuContent({ className, ...props }: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content collisionPadding={8} className={cn(contentClassName, className)} {...props} />
    </Menu.Portal>
  )
}

const itemClassName = cn(
  'flex h-8 cursor-default items-center gap-2.5 rounded-md px-2 text-callout outline-none select-none pointer-coarse:h-11',
  'data-disabled:opacity-45 data-highlighted:bg-accent data-highlighted:text-on-accent',
  '[&_svg]:size-4 [&_svg]:shrink-0',
)

interface ItemProps extends ComponentProps<typeof Menu.Item> {
  icon?: ReactNode
  destructive?: boolean
}

export function ContextMenuItem({ className, icon, destructive, children, ...props }: ItemProps) {
  return (
    <Menu.Item
      className={cn(
        itemClassName,
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

export function ContextMenuSub({
  label,
  icon,
  children,
}: {
  label: ReactNode
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <Menu.Sub>
      <Menu.SubTrigger
        className={cn(itemClassName, 'text-text data-[state=open]:bg-fill-selected')}
      >
        {icon}
        {label}
      </Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent collisionPadding={8} className={contentClassName}>
          {children}
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  )
}

export function ContextMenuSeparator() {
  return <Menu.Separator className="mx-2 my-1 h-px bg-separator" />
}
