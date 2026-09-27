import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

import type { Config } from '../config.js'
import type { AppContext } from '../context.js'

const SESSION_COOKIE = 'crystal_session'
/** `__Host-` binds the cookie to this exact host and requires HTTPS. */
const SECURE_SESSION_COOKIE = `__Host-${SESSION_COOKIE}`
export const OIDC_FLOW_COOKIE = 'crystal_oidc'
export const OIDC_FLOW_COOKIE_PATH = '/api/v1/auth/oidc'

/**
 * Whether cookies can be marked `Secure`. Browsers drop `Secure` cookies on plain
 * HTTP, so this must follow the real scheme: from `BASE_URL` if set, otherwise
 * from the request (honouring X-Forwarded-Proto only behind a trusted proxy).
 */
export function isSecureRequest(c: AppContext, config: Config): boolean {
  if (config.baseUrl) return config.baseUrl.protocol === 'https:'
  if (config.trustProxyHops > 0) {
    const proto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
    if (proto) return proto === 'https'
  }
  return new URL(c.req.url).protocol === 'https:'
}

export function readSessionToken(c: AppContext): string | undefined {
  return getCookie(c, SECURE_SESSION_COOKIE) ?? getCookie(c, SESSION_COOKIE)
}

export function setSessionCookie(
  c: AppContext,
  config: Config,
  token: string,
  maxAgeSeconds: number,
): void {
  const secure = isSecureRequest(c, config)
  setCookie(c, secure ? SECURE_SESSION_COOKIE : SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    maxAge: maxAgeSeconds,
  })
}

export function clearSessionCookie(c: AppContext, config: Config): void {
  const secure = isSecureRequest(c, config)
  deleteCookie(c, secure ? SECURE_SESSION_COOKIE : SESSION_COOKIE, {
    path: '/',
    secure,
    httpOnly: true,
    sameSite: 'Lax',
  })
}

export function setOidcFlowCookie(c: AppContext, config: Config, value: string): void {
  setCookie(c, OIDC_FLOW_COOKIE, value, {
    path: OIDC_FLOW_COOKIE_PATH,
    httpOnly: true,
    secure: isSecureRequest(c, config),
    // Lax: the cookie must survive the top-level redirect back from the provider.
    sameSite: 'Lax',
    maxAge: 10 * 60,
  })
}

export function takeOidcFlowCookie(c: AppContext, config: Config): string | undefined {
  const value = getCookie(c, OIDC_FLOW_COOKIE)
  deleteCookie(c, OIDC_FLOW_COOKIE, {
    path: OIDC_FLOW_COOKIE_PATH,
    secure: isSecureRequest(c, config),
    httpOnly: true,
    sameSite: 'Lax',
  })
  return value
}
