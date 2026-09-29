import type { Context } from 'hono'

import type { ApiTokenRow, SessionRow, UserRow } from './db/schema.js'
import { AppError } from './lib/errors.js'

/** Who is making the request: a browser session, or a personal API token. */
export type AuthState =
  | { kind: 'session'; user: UserRow; session: SessionRow }
  | { kind: 'token'; user: UserRow; token: ApiTokenRow }

export interface AppEnv {
  Variables: {
    requestId: string
    clientIp: string | undefined
    auth: AuthState | undefined
  }
}

export type AppContext = Context<AppEnv>

/** Returns the signed-in user, or fails with 401. */
export function requireAuthState(c: AppContext): AuthState {
  const auth = c.get('auth')
  if (!auth) throw new AppError(401, 'unauthorized')
  return auth
}

/** For account settings that need a browser session (never an API token). */
export function requireSession(c: AppContext): { user: UserRow; session: SessionRow } {
  const auth = requireAuthState(c)
  if (auth.kind !== 'session') throw new AppError(403, 'token_not_allowed')
  return auth
}
