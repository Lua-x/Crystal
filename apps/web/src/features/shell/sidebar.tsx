import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown, House, LogOut, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Logo } from '../../components/brand/logo'
import { Avatar } from '../../components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { useLogout } from '../../lib/queries'
import { useMe } from './use-me'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-13 shrink-0 items-center gap-2 px-4">
        <Logo className="size-6" />
        <span className="text-callout font-semibold">{t('common.appName')}</span>
      </div>

      <nav aria-label={t('shell.mainNavigation')} className="flex-1 overflow-y-auto px-2.5 py-2">
        <ul className="flex flex-col gap-0.5">
          <li>
            <SidebarLink to="/" icon={<House />} onNavigate={onNavigate}>
              {t('common.home')}
            </SidebarLink>
          </li>
        </ul>
      </nav>

      <div className="shrink-0 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <AccountMenu onNavigate={onNavigate} />
      </div>
    </div>
  )
}

interface SidebarLinkProps {
  to: '/' | '/settings'
  icon: ReactNode
  children: ReactNode
  onNavigate: (() => void) | undefined
}

function SidebarLink({ to, icon, children, onNavigate }: SidebarLinkProps) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      activeOptions={{ exact: to === '/' }}
      className="flex h-8 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-callout text-text transition-colors hover:bg-fill-hover data-[status=active]:bg-fill-selected data-[status=active]:font-medium pointer-coarse:h-11 [&_svg]:size-4.5 [&_svg]:text-accent-text"
    >
      {icon}
      {children}
    </Link>
  )
}

function AccountMenu({ onNavigate }: { onNavigate: (() => void) | undefined }) {
  const { t } = useTranslation()
  const me = useMe()
  const navigate = useNavigate()
  const logout = useLogout()

  const signOut = async () => {
    await logout.mutateAsync().catch(() => undefined)
    await navigate({ to: '/login', replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('shell.accountMenu')}
        className="flex w-full cursor-default items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-fill-hover data-[state=open]:bg-fill-selected pointer-coarse:py-2.5"
      >
        <Avatar name={me.displayName} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-callout font-medium">{me.displayName}</span>
          <span className="block truncate text-footnote text-text-secondary">@{me.username}</span>
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-text-secondary" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width)"
      >
        <DropdownMenuLabel>{me.email ?? `@${me.username}`}</DropdownMenuLabel>
        <DropdownMenuItem
          icon={<Settings />}
          onSelect={() => {
            onNavigate?.()
            void navigate({ to: '/settings' })
          }}
        >
          {t('common.settings')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<LogOut />} onSelect={() => void signOut()}>
          {t('common.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
