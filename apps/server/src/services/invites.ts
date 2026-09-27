import {
  uuidv7,
  type CreateInviteInput,
  type Invite,
  type InvitePreview,
  type InviteStatus,
} from '@crystal/shared'
import { and, desc, eq, lt, sql } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import { invites, users, type InviteRow } from '../db/schema.js'
import type { Executor } from '../db/types.js'
import { randomToken, sha256 } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'

const DAY_MS = 24 * 60 * 60 * 1000

export class InviteService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date,
  ) {}

  create(input: CreateInviteInput, createdBy: string): { invite: Invite; token: string } {
    const token = randomToken()
    const now = this.now()
    const row: InviteRow = {
      id: uuidv7(now.getTime()),
      tokenHash: sha256(token),
      role: input.role,
      note: input.note || null,
      maxUses: input.maxUses,
      uses: 0,
      expiresAt:
        input.expiresInDays === null
          ? null
          : new Date(now.getTime() + input.expiresInDays * DAY_MS),
      revokedAt: null,
      createdBy,
      createdAt: now,
    }
    this.db.insert(invites).values(row).run()
    const creator = this.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, createdBy))
      .get()
    return { invite: this.toDto(row, creator?.displayName ?? null), token }
  }

  list(): Invite[] {
    return this.db
      .select({ invite: invites, createdByName: users.displayName })
      .from(invites)
      .leftJoin(users, eq(users.id, invites.createdBy))
      .orderBy(desc(invites.createdAt))
      .all()
      .map(({ invite, createdByName }) => this.toDto(invite, createdByName))
  }

  revoke(id: string): boolean {
    const result = this.db
      .update(invites)
      .set({ revokedAt: this.now() })
      .where(and(eq(invites.id, id), sql`${invites.revokedAt} is null`))
      .run()
    return result.changes > 0
  }

  /** Returns the invite behind a token if it can still be used. */
  findUsable(executor: Executor, token: string): InviteRow | undefined {
    const row = executor
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, sha256(token)))
      .get()
    return row && this.status(row) === 'active' ? row : undefined
  }

  preview(token: string): InvitePreview {
    const row = this.findUsable(this.db, token)
    if (!row) throw new AppError(404, 'invite_invalid')
    const creator = row.createdBy
      ? this.db
          .select({ displayName: users.displayName })
          .from(users)
          .where(eq(users.id, row.createdBy))
          .get()
      : undefined
    return {
      role: row.role,
      invitedBy: creator?.displayName ?? '',
      expiresAt: row.expiresAt?.toISOString() ?? null,
    }
  }

  /** Counts one use. The conditional update guards against concurrent over-use. */
  consume(executor: Executor, invite: InviteRow): void {
    const result = executor
      .update(invites)
      .set({ uses: sql`${invites.uses} + 1` })
      .where(and(eq(invites.id, invite.id), lt(invites.uses, invites.maxUses)))
      .run()
    if (result.changes === 0) throw new AppError(400, 'invite_invalid')
  }

  private status(row: InviteRow): InviteStatus {
    if (row.revokedAt) return 'revoked'
    if (row.uses >= row.maxUses) return 'used'
    if (row.expiresAt && row.expiresAt.getTime() <= this.now().getTime()) return 'expired'
    return 'active'
  }

  private toDto(row: InviteRow, createdByName: string | null): Invite {
    return {
      id: row.id,
      role: row.role,
      note: row.note,
      maxUses: row.maxUses,
      uses: row.uses,
      status: this.status(row),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      createdBy: createdByName,
    }
  }
}
