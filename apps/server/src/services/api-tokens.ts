import {
  API_TOKEN_PREFIX,
  API_TOKENS_PER_USER_MAX,
  uuidv7,
  type ApiToken,
  type CreateApiTokenInput,
  type CreatedApiToken,
} from '@crystal/shared'
import { and, count, desc, eq, isNotNull, lt } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import { apiTokens, users, type ApiTokenRow, type UserRow } from '../db/schema.js'
import { randomToken, sha256 } from '../lib/crypto.js'
import { AppError, notFound } from '../lib/errors.js'

const DAY_MS = 24 * 60 * 60 * 1000
/** `last_used_at` is only written this often, not on every request. */
const LAST_USED_RESOLUTION_MS = 60 * 1000
/** Characters of the token kept visible, including the prefix. */
const HINT_LENGTH = API_TOKEN_PREFIX.length + 4

/**
 * Personal API tokens. Like sessions, only the SHA-256 hash is stored; the
 * token itself is shown once, when it is created.
 */
export class ApiTokenService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date,
  ) {}

  list(user: UserRow): ApiToken[] {
    return this.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.userId, user.id))
      .orderBy(desc(apiTokens.createdAt), desc(apiTokens.id))
      .all()
      .map(toApiToken)
  }

  create(user: UserRow, input: CreateApiTokenInput): CreatedApiToken {
    const existing =
      this.db.select({ value: count() }).from(apiTokens).where(eq(apiTokens.userId, user.id)).get()
        ?.value ?? 0
    if (existing >= API_TOKENS_PER_USER_MAX) {
      throw new AppError(
        400,
        'validation_failed',
        `You can have up to ${API_TOKENS_PER_USER_MAX} tokens.`,
      )
    }
    const token = `${API_TOKEN_PREFIX}${randomToken()}`
    const now = this.now()
    const row = this.db
      .insert(apiTokens)
      .values({
        id: uuidv7(now.getTime()),
        userId: user.id,
        name: input.name,
        tokenHash: sha256(token),
        hint: token.slice(0, HINT_LENGTH),
        scope: input.scope,
        createdAt: now,
        expiresAt:
          input.expiresInDays === null
            ? null
            : new Date(now.getTime() + input.expiresInDays * DAY_MS),
      })
      .returning()
      .get()
    return { ...toApiToken(row), token }
  }

  revoke(user: UserRow, tokenId: string): void {
    const result = this.db
      .delete(apiTokens)
      .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, user.id)))
      .run()
    if (result.changes === 0) throw notFound()
  }

  /** The token and its user, if the token is valid and the account active. */
  validate(token: string): { token: ApiTokenRow; user: UserRow } | null {
    if (!token.startsWith(API_TOKEN_PREFIX)) return null
    const row = this.db
      .select({ token: apiTokens, user: users })
      .from(apiTokens)
      .innerJoin(users, eq(users.id, apiTokens.userId))
      .where(eq(apiTokens.tokenHash, sha256(token)))
      .get()
    const now = this.now()
    if (!row || row.user.disabledAt) return null
    if (row.token.expiresAt && row.token.expiresAt <= now) return null

    const lastUsed = row.token.lastUsedAt?.getTime() ?? 0
    if (now.getTime() - lastUsed >= LAST_USED_RESOLUTION_MS) {
      this.db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.token.id)).run()
    }
    return row
  }

  /** Whether the token still exists and works (checked by long-lived event streams). */
  isActive(tokenId: string): boolean {
    const row = this.db
      .select({ expiresAt: apiTokens.expiresAt })
      .from(apiTokens)
      .where(eq(apiTokens.id, tokenId))
      .get()
    return row !== undefined && (row.expiresAt === null || row.expiresAt > this.now())
  }

  /** Removes tokens that expired more than a month ago (the list shows recent ones as expired). */
  deleteExpired(): number {
    const cutoff = new Date(this.now().getTime() - 30 * DAY_MS)
    return this.db
      .delete(apiTokens)
      .where(and(isNotNull(apiTokens.expiresAt), lt(apiTokens.expiresAt, cutoff)))
      .run().changes
  }
}

function toApiToken(row: ApiTokenRow): ApiToken {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    hint: row.hint,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  }
}
