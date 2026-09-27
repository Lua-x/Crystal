import { ERROR_CODES, type ErrorCode } from '@crystal/shared'
import i18next from 'i18next'

import { ApiError } from './api'

function isErrorCode(code: string): code is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(code)
}

/** A translated, user-facing message for any error. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'network') return i18next.t('errors.network')
    if (isErrorCode(error.code)) return i18next.t(`errors.${error.code}`)
  }
  return i18next.t('errors.unexpected')
}

/** Translates an error code from a URL (e.g. `/login?error=oidc_failed`). */
export function errorCodeMessage(code: string | undefined): string | undefined {
  if (!code) return undefined
  return isErrorCode(code) ? i18next.t(`errors.${code}`) : i18next.t('errors.unexpected')
}

/** Only allows same-site paths as redirect targets (no open redirects). */
export function safeRedirect(target: string | undefined): string {
  return target && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')
    ? target
    : '/'
}
