import type { Context } from 'hono'

import type { SessionRow, UserRow } from './db/schema.js'
import { AppError } from './lib/errors.js'

export interface AuthState {
  user: UserRow
  session: SessionRow
}

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
