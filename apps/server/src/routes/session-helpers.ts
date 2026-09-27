import { readSessionToken, setSessionCookie } from '../auth/cookies.js'
import type { AppContext } from '../context.js'
import type { UserRow } from '../db/schema.js'
import type { Services } from '../services/index.js'

/**
 * Starts a fresh session for `user` and sets the cookie. Any session the browser
 * still carried is revoked first, which prevents session fixation.
 */
export function startSession(c: AppContext, services: Services, user: UserRow): void {
  const previous = readSessionToken(c)
  if (previous) services.sessions.revokeByToken(previous)

  const { token } = services.sessions.create(user.id, {
    userAgent: c.req.header('user-agent'),
    ipAddress: c.get('clientIp'),
  })
  setSessionCookie(c, services.config, token, services.sessions.maxAgeSeconds)
}
