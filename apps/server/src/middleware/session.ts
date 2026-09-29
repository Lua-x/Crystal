import type { MiddlewareHandler } from 'hono'

import { clearSessionCookie, readSessionToken, setSessionCookie } from '../auth/cookies.js'
import type { AppContext, AppEnv } from '../context.js'
import { AppError } from '../lib/errors.js'
import type { Services } from '../services/index.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * `Authorization: Bearer <token>` if present. A malformed header yields an
 * empty string, so it fails like a wrong token instead of being ignored.
 */
export function readBearerToken(c: AppContext): string | undefined {
  const header = c.req.header('authorization')
  if (header === undefined) return undefined
  return /^Bearer\s+(\S+)\s*$/i.exec(header)?.[1] ?? ''
}

/**
 * Resolves the caller into `c.var.auth`: an API token from the `Authorization`
 * header, or else the session cookie. A request with a token never falls back
 * to the cookie, so the two can never mix.
 */
export function sessionMiddleware(services: Services): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const bearer = readBearerToken(c)
    if (bearer !== undefined) {
      const result = services.apiTokens.validate(bearer)
      if (!result) throw new AppError(401, 'unauthorized')
      c.set('auth', { kind: 'token', user: result.user, token: result.token })
      await next()
      return
    }

    const token = readSessionToken(c)
    if (token) {
      const result = services.sessions.validate(token)
      if (result) {
        c.set('auth', { kind: 'session', user: result.user, session: result.session })
        if (result.renewed) {
          setSessionCookie(c, services.config, token, services.sessions.maxAgeSeconds)
        }
      } else {
        clearSessionCookie(c, services.config)
      }
    }
    await next()
  }
}

/** What API tokens can reach: tasks and lists, not account or instance settings. */
const TOKEN_PATHS =
  /^\/api\/v1\/(lists|list-groups|tasks|subtasks|attachments|views|search|tags|people|events|export|import)(\/|$)/

/**
 * Keeps API tokens to the data they are meant for, and read-only tokens to
 * reading. Account settings (password, sessions, tokens, notifications) and
 * administration always need a browser session.
 */
export const tokenPolicy: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.get('auth')
  if (auth?.kind === 'token') {
    const path = c.req.path.replace(/\/+$/, '')
    const allowed = TOKEN_PATHS.test(path) || (path === '/api/v1/me' && c.req.method === 'GET')
    if (!allowed) throw new AppError(403, 'token_not_allowed')
    if (auth.token.scope === 'read' && !SAFE_METHODS.has(c.req.method)) {
      throw new AppError(403, 'token_not_allowed', 'This token can only read.')
    }
  }
  await next()
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('auth')) throw new AppError(401, 'unauthorized')
  await next()
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.get('auth')
  if (!auth) throw new AppError(401, 'unauthorized')
  if (auth.user.role !== 'admin') throw new AppError(403, 'forbidden')
  await next()
}
