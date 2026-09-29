import { Link, Navigate, Outlet, useRouterState } from '@tanstack/react-router'
import {
  ArrowDownUp,
  Bell,
  Braces,
  CalendarDays,
  ChevronRight,
  MonitorSmartphone,
  Palette,
  Ticket,
  UserRound,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../lib/cn'
import { useMediaQuery, WIDE_QUERY } from '../../lib/use-media-query'
import { Page } from '../shell/page'
import { useMe } from '../shell/use-me'

type SettingsPath =
  | '/settings/account'
  | '/settings/appearance'
  | '/settings/notifications'
  | '/settings/sessions'
  | '/settings/api'
  | '/settings/calendar'
  | '/settings/transfer'
  | '/settings/users'
  | '/settings/invites'

interface NavItem {
  to: SettingsPath
  icon: ReactNode
  label: string
}

function useNavGroups(): { label?: string; items: NavItem[] }[] {
  const { t } = useTranslation()
  const me = useMe()
  const groups: { label?: string; items: NavItem[] }[] = [
    {
      items: [
        { to: '/settings/account', icon: <UserRound />, label: t('settings.sections.account') },
        { to: '/settings/appearance', icon: <Palette />, label: t('settings.sections.appearance') },
        {
          to: '/settings/notifications',
          icon: <Bell />,
          label: t('settings.sections.notifications'),
        },
        {
          to: '/settings/sessions',
          icon: <MonitorSmartphone />,
          label: t('settings.sections.sessions'),
        },
      ],
    },
    {
      label: t('settings.integrations'),
      items: [
        {
          to: '/settings/calendar',
          icon: <CalendarDays />,
          label: t('settings.sections.calendar'),
        },
        {
          to: '/settings/transfer',
          icon: <ArrowDownUp />,
          label: t('settings.sections.transfer'),
        },
        { to: '/settings/api', icon: <Braces />, label: t('settings.sections.api') },
      ],
    },
  ]
  if (me.role === 'admin') {
    groups.push({
      label: t('settings.administration'),
      items: [
        { to: '/settings/users', icon: <Users />, label: t('settings.sections.users') },
        { to: '/settings/invites', icon: <Ticket />, label: t('settings.sections.invites') },
      ],
    })
  }
  return groups
}

/**
 * Wide screens: section list and content side by side. Narrow screens: the
 * section list is its own page (`/settings`), like the iOS Settings app.
 */
export function SettingsLayout() {
  const { t } = useTranslation()
  const isWide = useMediaQuery(WIDE_QUERY)
  const groups = useNavGroups()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isIndex = pathname.replace(/\/$/, '') === '/settings'

  if (!isWide) return <Outlet />
  if (isIndex) return <Navigate to="/settings/account" replace />

  return (
    <div className="flex h-full min-h-0">
      <nav
        aria-label={t('settings.title')}
        className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto bg-canvas px-3 pt-4 pb-6 hairline-r"
      >
        <h2 className="px-2 pt-9 text-title3 font-bold">{t('settings.title')}</h2>
        {groups.map((group, index) => (
          <div key={group.label ?? index} className="flex flex-col gap-0.5">
            {group.label && (
              <h3 className="px-2 pb-1 text-footnote font-semibold text-text-secondary">
                {group.label}
              </h3>
            )}
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex h-8 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-callout transition-colors hover:bg-fill-hover data-[status=active]:bg-fill-selected data-[status=active]:font-medium [&_svg]:size-4.5 [&_svg]:text-accent-text"
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}

/** The section list on narrow screens. */
export function SettingsIndexPage() {
  const { t } = useTranslation()
  const groups = useNavGroups()
  return (
    <Page title={t('settings.title')} variant="grouped">
      <div className="flex flex-col gap-6">
        {groups.map((group, index) => (
          <section key={group.label ?? index} className="flex flex-col gap-2">
            {group.label && (
              <h2 className="px-1 text-subhead font-semibold text-text-secondary">{group.label}</h2>
            )}
            <div className="divide-y divide-separator overflow-hidden rounded-xl bg-cell shadow-sm">
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex min-h-12 cursor-default items-center gap-3 px-4 py-2.5 transition-colors hover:bg-fill-hover',
                    'focus-visible:-outline-offset-2 [&_svg]:size-5 [&_svg]:text-accent-text',
                  )}
                >
                  {item.icon}
                  <span className="flex-1 text-body">{item.label}</span>
                  <ChevronRight aria-hidden className="size-4! text-text-secondary!" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Page>
  )
}
