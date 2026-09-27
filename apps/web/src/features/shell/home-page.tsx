import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Clock, KeyRound, Palette, UserPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { GroupedSection } from '../../components/ui/grouped'
import { deviceTimeZone, formatLongDate } from '../../lib/format'
import { authConfigQuery } from '../../lib/queries'
import { Page } from './page'
import { useMe } from './use-me'

function greetingKey(date: Date, timeZone: string) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(date),
  )
  if (hour < 11) return 'home.greetingMorning' as const
  if (hour < 18) return 'home.greetingAfternoon' as const
  return 'home.greetingEvening' as const
}

export function HomePage() {
  const { t, i18n } = useTranslation()
  const me = useMe()
  const { data: config } = useQuery(authConfigQuery)
  const now = new Date()
  const firstName = me.displayName.split(/\s+/)[0] ?? me.displayName
  const deviceZone = deviceTimeZone()

  return (
    <Page
      title={t(greetingKey(now, me.timezone), { name: firstName })}
      subtitle={formatLongDate(now, i18n.language, me.timezone)}
    >
      <p className="mb-4 text-body text-text-secondary">{t('home.intro')}</p>
      <GroupedSection>
        <SetupRow
          to="/settings/appearance"
          icon={<Palette />}
          title={t('home.appearanceTitle')}
          body={t('home.appearanceBody')}
        />
        {me.role === 'admin' && (
          <SetupRow
            to="/settings/invites"
            icon={<UserPlus />}
            title={t('home.inviteTitle')}
            body={t('home.inviteBody')}
          />
        )}
        {config?.oidc.enabled && me.identities.length === 0 && (
          <SetupRow
            to="/settings/account"
            icon={<KeyRound />}
            title={t('home.ssoTitle')}
            body={t('home.ssoBody', { provider: config.oidc.buttonLabel })}
          />
        )}
        {me.timezone !== deviceZone && (
          <SetupRow
            to="/settings/account"
            icon={<Clock />}
            title={t('home.regionTitle')}
            body={t('home.regionBody', { zone: me.timezone })}
          />
        )}
      </GroupedSection>
    </Page>
  )
}

interface SetupRowProps {
  to: '/settings/appearance' | '/settings/invites' | '/settings/account'
  icon: ReactNode
  title: string
  body: string
}

function SetupRow({ to, icon, title, body }: SetupRowProps) {
  return (
    <Link
      to={to}
      className="flex cursor-default items-center gap-3.5 px-4 py-3 transition-colors hover:bg-fill-hover focus-visible:-outline-offset-2"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text [&_svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium">{title}</span>
        <span className="block text-subhead text-text-secondary">{body}</span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-text-secondary" />
    </Link>
  )
}
