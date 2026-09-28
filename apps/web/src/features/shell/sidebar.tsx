import { useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown, FolderPlus, LogOut, Plus, Settings } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Logo } from '../../components/brand/logo'
import { Avatar } from '../../components/ui/avatar'
import { Button } from '../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { IconButton } from '../../components/ui/icon-button'
import { useLogout } from '../../lib/queries'
import { GroupDialog, ListDialog } from '../tasks/list-dialogs'
import { SearchField } from '../tasks/search'
import { SidebarLists, SmartTiles } from '../tasks/sidebar-lists'
import { useMe } from './use-me'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const [dialog, setDialog] = useState<'list' | 'group' | null>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-13 shrink-0 items-center gap-2 px-4">
        <Logo className="size-6" />
        <span className="text-callout font-semibold">{t('common.appName')}</span>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <SearchField {...(onNavigate ? { onSearch: onNavigate } : {})} />
      </div>

      <nav aria-label={t('shell.mainNavigation')} className="flex-1 overflow-y-auto px-3 pb-3">
        <SmartTiles onNavigate={onNavigate} />
        <h2 className="mt-5 mb-1 px-1.5 text-footnote font-semibold text-text-secondary">
          {t('lists.myLists')}
        </h2>
        <SidebarLists onNavigate={onNavigate} />
      </nav>

      <div className="flex shrink-0 items-center gap-1 px-2.5 pt-1">
        <Button variant="ghost" className="flex-1 justify-start" onClick={() => setDialog('list')}>
          <Plus aria-hidden className="text-accent-text" />
          {t('lists.newList')}
        </Button>
        <IconButton label={t('lists.newGroup')} onClick={() => setDialog('group')}>
          <FolderPlus />
        </IconButton>
      </div>

      <div className="shrink-0 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <AccountMenu onNavigate={onNavigate} />
      </div>

      <ListDialog
        open={dialog === 'list'}
        onOpenChange={(open) => setDialog(open ? 'list' : null)}
        onCreated={onNavigate}
      />
      <GroupDialog
        open={dialog === 'group'}
        onOpenChange={(open) => setDialog(open ? 'group' : null)}
      />
    </div>
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
