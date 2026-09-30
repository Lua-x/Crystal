import type { InstanceMode } from '@crystal/shared'
import { KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'

/** Starts the OIDC flow. A plain link: the browser leaves for the identity provider. */
export function SsoButton({
  provider,
  intent = 'login',
  mode,
}: {
  provider: string
  intent?: 'login' | 'link'
  /** Chosen on the setup page; applies if this sign-in creates the first account. */
  mode?: InstanceMode
}) {
  const { t } = useTranslation()
  const query = new URLSearchParams({
    ...(intent === 'link' ? { intent } : {}),
    ...(mode ? { mode } : {}),
  }).toString()
  return (
    <Button asChild variant="secondary" size="lg" className="w-full">
      <a href={`/api/v1/auth/oidc/start${query ? `?${query}` : ''}`}>
        <KeyRound aria-hidden />
        {intent === 'login'
          ? t('auth.continueWith', { provider })
          : t('settings.account.ssoLink', { provider })}
      </a>
    </Button>
  )
}

export function Divider({ label }: { label: string }) {
  return (
    <div
      className="my-5 flex items-center gap-3 text-footnote text-text-secondary"
      role="separator"
    >
      <span className="h-px flex-1 bg-separator" />
      {label}
      <span className="h-px flex-1 bg-separator" />
    </div>
  )
}
