import {
  uuidv7,
  type CreateListGroupInput,
  type CreateListInput,
  type List,
  type ListGroup,
  type ListPlacement,
  type ListRole,
  type Locale,
  type UpdateListGroupInput,
  type UpdateListInput,
} from '@crystal/shared'
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import { listGroups, listMembers, lists, tasks, type UserRow } from '../db/schema.js'
import type { Executor } from '../db/types.js'
import { AppError } from '../lib/errors.js'
import {
  freshPositions,
  positionAfter,
  positionAtEnd,
  positionAtStart,
  type Ordered,
} from '../lib/ordering.js'
import type { SearchService } from './search.js'

const ROLE_RANK: Record<ListRole, number> = { viewer: 0, editor: 1, owner: 2 }
const DEFAULT_LIST_NAME: Record<Locale, string> = { de: 'Aufgaben', en: 'Tasks' }

interface SidebarItem extends Ordered {
  kind: 'list' | 'group'
}

/**
 * Lists, their members and the per-user sidebar (groups and order). Every read
 * and write checks the caller's role; lists a user has no access to are
 * reported as not found, so their existence is not revealed.
 */
export class ListService {
  constructor(
    private readonly db: Db,
    private readonly search: SearchService,
    private readonly now: () => Date,
  ) {}

  roleOf(userId: string, listId: string, executor: Executor = this.db): ListRole | undefined {
    return executor
      .select({ role: listMembers.role })
      .from(listMembers)
      .innerJoin(lists, eq(lists.id, listMembers.listId))
      .where(
        and(
          eq(listMembers.listId, listId),
          eq(listMembers.userId, userId),
          isNull(lists.deletedAt),
        ),
      )
      .get()?.role
  }

  /** Fails with 404 without access and with 403 when the role is too low. */
  requireRole(
    userId: string,
    listId: string,
    minimum: ListRole,
    executor: Executor = this.db,
  ): ListRole {
    const role = this.roleOf(userId, listId, executor)
    if (!role) throw new AppError(404, 'not_found')
    if (ROLE_RANK[role] < ROLE_RANK[minimum]) throw new AppError(403, 'forbidden')
    return role
  }

  /** The user's default list, created on first use. */
  ensureDefaultList(user: UserRow): string {
    const existing = this.db
      .select({ id: lists.id })
      .from(lists)
      .where(and(eq(lists.createdBy, user.id), eq(lists.isDefault, true), isNull(lists.deletedAt)))
      .get()
    if (existing) return existing.id

    return this.db.transaction((tx) => {
      const id = uuidv7(this.now().getTime())
      this.insertList(tx, user.id, {
        id,
        name: DEFAULT_LIST_NAME[user.locale],
        color: 'blue',
        icon: null,
        isDefault: true,
        groupId: null,
        position: positionAtStart(this.topLevelItems(user.id, tx)),
      })
      return id
    })
  }

  listForUser(user: UserRow): List[] {
    this.ensureDefaultList(user)
    return this.selectLists(user.id)
  }

  get(user: UserRow, listId: string): List {
    this.requireRole(user.id, listId, 'viewer')
    const list = this.selectLists(user.id, listId)[0]
    if (!list) throw new AppError(404, 'not_found')
    return list
  }

  create(user: UserRow, input: CreateListInput): List {
    const id = input.id ?? uuidv7(this.now().getTime())
    this.db.transaction((tx) => {
      if (tx.select({ id: lists.id }).from(lists).where(eq(lists.id, id)).get()) {
        throw new AppError(400, 'validation_failed', 'This ID is already in use.')
      }
      const groupId = input.groupId ?? null
      if (groupId) this.requireGroup(user.id, groupId, tx)
      const container = groupId
        ? this.groupItems(user.id, groupId, tx)
        : this.topLevelItems(user.id, tx)
      this.insertList(tx, user.id, {
        id,
        name: input.name,
        color: input.color ?? 'blue',
        icon: input.icon ?? null,
        isDefault: false,
        groupId,
        position: positionAtEnd(container),
      })
    })
    return this.get(user, id)
  }

  update(user: UserRow, listId: string, input: UpdateListInput): List {
    this.db.transaction((tx) => {
      const role = this.requireRole(user.id, listId, 'viewer', tx)
      const changesList =
        input.name !== undefined || input.color !== undefined || input.icon !== undefined
      if (changesList) {
        if (role !== 'owner') throw new AppError(403, 'forbidden')
        tx.update(lists)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.color !== undefined ? { color: input.color } : {}),
            ...(input.icon !== undefined ? { icon: input.icon } : {}),
            updatedAt: this.now(),
          })
          .where(eq(lists.id, listId))
          .run()
      }
      if (input.placement) this.placeList(user.id, listId, input.placement, tx)
    })
    return this.get(user, listId)
  }

  /** Deletes softly; the cleanup job removes the list and its tasks later. */
  delete(user: UserRow, listId: string): void {
    this.db.transaction((tx) => {
      this.requireRole(user.id, listId, 'owner', tx)
      const list = tx.select().from(lists).where(eq(lists.id, listId)).get()
      if (list?.isDefault) throw new AppError(409, 'list_is_default')
      tx.update(lists).set({ deletedAt: this.now() }).where(eq(lists.id, listId)).run()
    })
  }

  /** Deletes all completed tasks of a list. Returns how many were deleted. */
  deleteCompleted(user: UserRow, listId: string): number {
    return this.db.transaction((tx) => {
      this.requireRole(user.id, listId, 'editor', tx)
      const done = tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.listId, listId), isNotNull(tasks.completedAt), isNull(tasks.deletedAt)))
        .all()
      if (done.length === 0) return 0
      const ids = done.map((task) => task.id)
      tx.update(tasks).set({ deletedAt: this.now() }).where(inArray(tasks.id, ids)).run()
      for (const id of ids) this.search.remove(id, tx)
      return ids.length
    })
  }

  /** Removes every list the user owns (used when an account is deleted). */
  deleteOwnedBy(userId: string, executor: Executor): void {
    const owned = executor
      .select({ id: listMembers.listId })
      .from(listMembers)
      .where(and(eq(listMembers.userId, userId), eq(listMembers.role, 'owner')))
      .all()
      .map((row) => row.id)
    if (owned.length > 0) executor.delete(lists).where(inArray(lists.id, owned)).run()
  }

  /* ── Groups ─────────────────────────────────────────────────── */

  groupsForUser(userId: string): ListGroup[] {
    return this.db
      .select()
      .from(listGroups)
      .where(eq(listGroups.userId, userId))
      .orderBy(asc(listGroups.position))
      .all()
      .map((group) => ({
        id: group.id,
        name: group.name,
        position: group.position,
        collapsed: group.collapsed,
      }))
  }

  createGroup(user: UserRow, input: CreateListGroupInput): ListGroup {
    const id = input.id ?? uuidv7(this.now().getTime())
    this.db.transaction((tx) => {
      if (tx.select({ id: listGroups.id }).from(listGroups).where(eq(listGroups.id, id)).get()) {
        throw new AppError(400, 'validation_failed', 'This ID is already in use.')
      }
      const now = this.now()
      tx.insert(listGroups)
        .values({
          id,
          userId: user.id,
          name: input.name,
          position: positionAtEnd(this.topLevelItems(user.id, tx)),
          collapsed: false,
          createdAt: now,
          updatedAt: now,
        })
        .run()
    })
    return this.getGroup(user.id, id)
  }

  updateGroup(user: UserRow, groupId: string, input: UpdateListGroupInput): ListGroup {
    this.db.transaction((tx) => {
      this.requireGroup(user.id, groupId, tx)
      const changes: Partial<typeof listGroups.$inferInsert> = { updatedAt: this.now() }
      if (input.name !== undefined) changes.name = input.name
      if (input.collapsed !== undefined) changes.collapsed = input.collapsed
      if (input.placement) {
        const items = this.topLevelItems(user.id, tx).filter((item) => item.id !== groupId)
        changes.position = positionAfter(items, input.placement.after, (stale) =>
          this.rebalanceTopLevel(user.id, stale, tx),
        )
      }
      tx.update(listGroups).set(changes).where(eq(listGroups.id, groupId)).run()
    })
    return this.getGroup(user.id, groupId)
  }

  /** Deletes a group; its lists move to the top level, where the group was. */
  deleteGroup(user: UserRow, groupId: string): void {
    this.db.transaction((tx) => {
      this.requireGroup(user.id, groupId, tx)
      const members = this.groupItems(user.id, groupId, tx)
      const topLevel = this.topLevelItems(user.id, tx)
      const index = topLevel.findIndex((item) => item.id === groupId)
      let previous = topLevel[index - 1]?.id ?? null
      for (const member of members) {
        const position = positionAfter(
          this.topLevelItems(user.id, tx).filter((item) => item.id !== groupId),
          previous,
          (stale) => this.rebalanceTopLevel(user.id, stale, tx),
        )
        tx.update(listMembers)
          .set({ groupId: null, position })
          .where(and(eq(listMembers.listId, member.id), eq(listMembers.userId, user.id)))
          .run()
        previous = member.id
      }
      tx.delete(listGroups).where(eq(listGroups.id, groupId)).run()
    })
  }

  /* ── Internals ──────────────────────────────────────────────── */

  private insertList(
    tx: Executor,
    userId: string,
    list: {
      id: string
      name: string
      color: List['color']
      icon: string | null
      isDefault: boolean
      groupId: string | null
      position: string
    },
  ): void {
    const now = this.now()
    tx.insert(lists)
      .values({
        id: list.id,
        name: list.name,
        color: list.color,
        icon: list.icon,
        isDefault: list.isDefault,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    tx.insert(listMembers)
      .values({
        listId: list.id,
        userId,
        role: 'owner',
        groupId: list.groupId,
        position: list.position,
        createdAt: now,
      })
      .run()
  }

  private selectLists(userId: string, onlyListId?: string): List[] {
    const openCount = sql<number>`(
      select count(*) from ${tasks}
      where ${tasks.listId} = ${lists.id}
        and ${tasks.deletedAt} is null
        and ${tasks.completedAt} is null
    )`
    return this.db
      .select({ list: lists, member: listMembers, openCount })
      .from(listMembers)
      .innerJoin(lists, eq(lists.id, listMembers.listId))
      .where(
        and(
          eq(listMembers.userId, userId),
          isNull(lists.deletedAt),
          onlyListId ? eq(lists.id, onlyListId) : undefined,
        ),
      )
      .orderBy(asc(listMembers.position))
      .all()
      .map(({ list, member, openCount }) => ({
        id: list.id,
        name: list.name,
        color: list.color,
        icon: list.icon,
        role: member.role,
        groupId: member.groupId,
        position: member.position,
        isDefault: list.isDefault && list.createdBy === userId,
        openCount: Number(openCount),
        createdAt: list.createdAt.toISOString(),
        updatedAt: list.updatedAt.toISOString(),
      }))
  }

  private getGroup(userId: string, groupId: string): ListGroup {
    const group = this.groupsForUser(userId).find((item) => item.id === groupId)
    if (!group) throw new AppError(404, 'not_found')
    return group
  }

  private requireGroup(userId: string, groupId: string, executor: Executor): void {
    const group = executor
      .select({ id: listGroups.id })
      .from(listGroups)
      .where(and(eq(listGroups.id, groupId), eq(listGroups.userId, userId)))
      .get()
    if (!group) throw new AppError(404, 'not_found')
  }

  private placeList(userId: string, listId: string, placement: ListPlacement, tx: Executor): void {
    let position: string
    if (placement.groupId) {
      this.requireGroup(userId, placement.groupId, tx)
      const others = this.groupItems(userId, placement.groupId, tx).filter(
        (item) => item.id !== listId,
      )
      position = positionAfter(others, placement.after, (stale) =>
        this.rebalanceGroup(userId, stale, tx),
      )
    } else {
      const others = this.topLevelItems(userId, tx).filter((item) => item.id !== listId)
      position = positionAfter(others, placement.after, (stale) =>
        this.rebalanceTopLevel(userId, stale, tx),
      )
    }
    tx.update(listMembers)
      .set({ groupId: placement.groupId, position })
      .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)))
      .run()
  }

  /** Groups and ungrouped lists share one order at the top level of the sidebar. */
  private topLevelItems(userId: string, executor: Executor): SidebarItem[] {
    const groupRows = executor
      .select({ id: listGroups.id, position: listGroups.position })
      .from(listGroups)
      .where(eq(listGroups.userId, userId))
      .all()
      .map((row) => ({ ...row, kind: 'group' as const }))
    const listRows = executor
      .select({ id: listMembers.listId, position: listMembers.position })
      .from(listMembers)
      .innerJoin(lists, eq(lists.id, listMembers.listId))
      .where(
        and(eq(listMembers.userId, userId), isNull(listMembers.groupId), isNull(lists.deletedAt)),
      )
      .all()
      .map((row) => ({ ...row, kind: 'list' as const }))
    return [...groupRows, ...listRows].sort((a, b) =>
      a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1,
    )
  }

  private groupItems(userId: string, groupId: string, executor: Executor): Ordered[] {
    return executor
      .select({ id: listMembers.listId, position: listMembers.position })
      .from(listMembers)
      .innerJoin(lists, eq(lists.id, listMembers.listId))
      .where(
        and(
          eq(listMembers.userId, userId),
          eq(listMembers.groupId, groupId),
          isNull(lists.deletedAt),
        ),
      )
      .orderBy(asc(listMembers.position), asc(listMembers.listId))
      .all()
  }

  private rebalanceTopLevel(userId: string, items: SidebarItem[], tx: Executor): SidebarItem[] {
    const fresh = freshPositions(items)
    for (const item of fresh) {
      if (item.kind === 'group') {
        tx.update(listGroups)
          .set({ position: item.position })
          .where(eq(listGroups.id, item.id))
          .run()
      } else {
        tx.update(listMembers)
          .set({ position: item.position })
          .where(and(eq(listMembers.listId, item.id), eq(listMembers.userId, userId)))
          .run()
      }
    }
    return fresh
  }

  private rebalanceGroup(userId: string, items: Ordered[], tx: Executor): Ordered[] {
    const fresh = freshPositions(items)
    for (const item of fresh) {
      tx.update(listMembers)
        .set({ position: item.position })
        .where(and(eq(listMembers.listId, item.id), eq(listMembers.userId, userId)))
        .run()
    }
    return fresh
  }
}
