import type { AdminUpdateUserInput } from '@crystal/shared'

import { hashPassword } from '../auth/password.js'
import type { Db } from '../db/client.js'
import type { UserRow } from '../db/schema.js'
import { AppError } from '../lib/errors.js'
import type { ListService } from './lists.js'
import type { SessionService } from './sessions.js'
import type { UserService } from './users.js'

/** User management for administrators, with safeguards against locking everyone out. */
export class AdminService {
  constructor(
    private readonly db: Db,
    private readonly users: UserService,
    private readonly sessions: SessionService,
    private readonly lists: ListService,
  ) {}

  async updateUser(actor: UserRow, targetId: string, input: AdminUpdateUserInput): Promise<void> {
    if (actor.id === targetId) throw new AppError(400, 'cannot_modify_self')

    // Hash before the synchronous transaction.
    const passwordHash = input.password ? await hashPassword(input.password) : undefined

    this.db.transaction((tx) => {
      const target = this.users.findById(targetId, tx)
      if (!target) throw new AppError(404, 'not_found')

      const losesAdmin =
        target.role === 'admin' &&
        !target.disabledAt &&
        (input.role === 'user' || input.disabled === true)
      if (losesAdmin && !this.users.hasOtherActiveAdmin(target.id, tx)) {
        throw new AppError(409, 'last_admin')
      }

      this.users.update(
        target.id,
        {
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.disabled !== undefined ? { disabled: input.disabled } : {}),
          ...(passwordHash !== undefined ? { passwordHash } : {}),
        },
        tx,
      )
    })

    // A disabled account or a reset password must not keep existing sessions alive.
    if (input.disabled === true || passwordHash !== undefined) {
      this.sessions.revokeAllForUser(targetId)
    }
  }

  deleteUser(actor: UserRow, targetId: string): void {
    if (actor.id === targetId) throw new AppError(400, 'cannot_modify_self')
    this.db.transaction((tx) => {
      const target = this.users.findById(targetId, tx)
      if (!target) throw new AppError(404, 'not_found')
      const isActiveAdmin = target.role === 'admin' && !target.disabledAt
      if (isActiveAdmin && !this.users.hasOtherActiveAdmin(target.id, tx)) {
        throw new AppError(409, 'last_admin')
      }
      // Lists the user owns go with the account; sessions, identities, memberships
      // and groups are removed through ON DELETE CASCADE.
      this.lists.deleteOwnedBy(target.id, tx)
      this.users.delete(target.id, tx)
    })
  }
}
