import {
  keysBetween,
  TASK_NOTES_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  uuidv7,
  type ImportSteamGameInput,
  type LinkSteamInput,
  type SteamGame,
  type SteamStatus,
  type SteamSyncResult,
} from '@crystal/shared'
import { and, asc, eq, isNotNull, isNull, lt, or } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import { achievements, listMembers, lists, tasks, users, type UserRow } from '../db/schema.js'
import type { Executor } from '../db/types.js'
import { AppError } from '../lib/errors.js'
import type { Logger } from '../lib/logger.js'
import type { SchemaAchievement, SteamClient } from '../steam/client.js'
import type { EventHub } from './events.js'
import type { ImageService, StoredImage } from './images.js'
import type { ListService } from './lists.js'
import type { SearchService } from './search.js'

const HOUR_MS = 60 * 60 * 1000
/** Give the server a moment after starting before the first automatic sync. */
const FIRST_CHECK_MS = 2 * 60 * 1000
/** Games compared with Steam per automatic run, so one run stays short. */
const SYNC_BATCH = 50
const ICON_MAX_BYTES = 512 * 1024
const HEADER_MAX_BYTES = 5 * 1024 * 1024
/** Downloads at the same time while importing. */
const DOWNLOADS_IN_PARALLEL = 8
const STEAM_ID = /^\d{17}$/
const VANITY_NAME = /^[\w-]{2,32}$/

export interface SteamServiceDeps {
  db: Db
  /** `undefined` when Steam is not set up. */
  client: SteamClient | undefined
  syncHours: number
  lists: ListService
  images: ImageService
  search: SearchService
  events: EventHub
  logger: Logger
  now: () => Date
}

/**
 * Steam achievements as goals. A game imported from Steam tracks the Steam
 * account of its owner: syncing ticks off what that account unlocked since, and
 * adds achievements the game gained (for example with DLC).
 */
export class SteamService {
  private timer: NodeJS.Timeout | undefined
  private firstCheck: NodeJS.Timeout | undefined
  private running: Promise<unknown> | undefined

  constructor(private readonly deps: SteamServiceDeps) {}

  status(user: UserRow): SteamStatus {
    return {
      available: this.deps.client !== undefined,
      profile:
        user.steamId && user.steamName ? { steamId: user.steamId, name: user.steamName } : null,
    }
  }

  /** Links a Steam account, given as a profile link, custom name or SteamID64. */
  async link(user: UserRow, input: LinkSteamInput): Promise<SteamStatus> {
    const client = this.requireClient()
    const reference = parseProfileReference(input.profile)
    if (!reference) throw new AppError(400, 'steam_profile_not_found')
    const steamId =
      reference.kind === 'id' ? reference.value : await client.resolveVanityName(reference.value)
    if (!steamId) throw new AppError(400, 'steam_profile_not_found')
    const name = await client.playerName(steamId)
    if (!name) throw new AppError(400, 'steam_profile_not_found')

    this.deps.db
      .update(users)
      .set({ steamId, steamName: name, updatedAt: this.deps.now() })
      .where(eq(users.id, user.id))
      .run()
    return { available: true, profile: { steamId, name } }
  }

  unlink(user: UserRow): SteamStatus {
    this.deps.db
      .update(users)
      .set({ steamId: null, steamName: null, updatedAt: this.deps.now() })
      .where(eq(users.id, user.id))
      .run()
    return { available: this.deps.client !== undefined, profile: null }
  }

  /** The linked library, most played first, with the games already imported. */
  async games(user: UserRow): Promise<SteamGame[]> {
    const client = this.requireClient()
    const steamId = this.requireSteamId(user)
    const owned = await client.ownedGames(steamId)
    if (!owned) throw new AppError(409, 'steam_profile_private')
    const imported = this.importedGames(user.id)
    return owned
      .map((game) => ({ ...game, listId: imported.get(game.appId) ?? null }))
      .sort(
        (a, b) =>
          b.playtimeMinutes - a.playtimeMinutes || a.name.localeCompare(b.name, user.locale),
      )
  }

  /** Creates a game with one goal per achievement; unlocked ones are already done. */
  async importGame(user: UserRow, input: ImportSteamGameInput): Promise<string> {
    const client = this.requireClient()
    const steamId = this.requireSteamId(user)
    const { appId } = input
    if (this.importedGames(user.id).has(appId)) {
      throw new AppError(409, 'steam_already_imported')
    }
    const [schema, percentages, unlocked, store] = await Promise.all([
      client.achievements(appId, user.locale),
      client.globalPercentages(appId),
      client.playerAchievements(steamId, appId),
      client.storeDetails(appId, user.locale),
    ])
    if (unlocked === 'private') throw new AppError(409, 'steam_profile_private')
    if (schema.length === 0) throw new AppError(409, 'steam_no_achievements')
    const name = store?.name ?? `Steam ${appId}`

    const written: StoredImage[] = []
    try {
      const header = store?.headerUrl
        ? await this.fetchImage(store.headerUrl, HEADER_MAX_BYTES, written)
        : null
      const icons = await this.fetchIcons(schema, written)

      const listId = this.deps.db.transaction((tx) => {
        if (input.groupId) this.deps.lists.requireGroup(user.id, input.groupId, tx)
        const id = this.deps.lists.addOwnedList(tx, user.id, {
          name: name.slice(0, 100),
          color: 'indigo',
          icon: null,
          groupId: input.groupId ?? null,
        })
        for (const image of written) {
          this.deps.images.record(tx, id, image === header ? 'cover' : 'icon', image)
        }
        tx.update(lists)
          .set({
            steamAppId: appId,
            steamSyncedAt: this.deps.now(),
            coverImageId: header?.id ?? null,
          })
          .where(eq(lists.id, id))
          .run()
        const positions = keysBetween(null, null, schema.length)
        schema.forEach((achievement, index) => {
          this.addGoal(tx, {
            listId: id,
            achievement,
            position: positions[index]!,
            iconImageId: icons.get(achievement.apiName)?.id ?? null,
            percent: percentages.get(achievement.apiName) ?? null,
            unlockedAt: unlockedAt(unlocked.get(achievement.apiName), this.deps.now()),
            owner: user,
          })
        })
        return id
      })
      this.deps.events.personalChange(user.id)
      return listId
    } catch (error) {
      await Promise.all(written.map((image) => this.deps.images.discard(image.id)))
      throw error
    }
  }

  /** Compares a game with its owner's achievements on Steam. */
  async sync(user: UserRow, listId: string): Promise<SteamSyncResult> {
    this.deps.lists.requireRole(user.id, listId, 'editor')
    return this.syncGame(listId)
  }

  /** Syncs the games that were not compared for `syncHours`, oldest first. */
  async syncDue(): Promise<number> {
    if (!this.deps.client || this.deps.syncHours === 0) return 0
    const cutoff = new Date(this.deps.now().getTime() - this.deps.syncHours * HOUR_MS)
    const due = this.deps.db
      .select({ id: lists.id })
      .from(lists)
      .innerJoin(listMembers, and(eq(listMembers.listId, lists.id), eq(listMembers.role, 'owner')))
      .innerJoin(users, eq(users.id, listMembers.userId))
      .where(
        and(
          isNotNull(lists.steamAppId),
          isNull(lists.deletedAt),
          isNotNull(users.steamId),
          isNull(users.disabledAt),
          or(isNull(lists.steamSyncedAt), lt(lists.steamSyncedAt, cutoff)),
        ),
      )
      .orderBy(asc(lists.steamSyncedAt))
      .limit(SYNC_BATCH)
      .all()
    let synced = 0
    for (const { id } of due) {
      try {
        await this.syncGame(id)
        synced++
      } catch (error) {
        // One game (e.g. a profile turned private) must not stop the others.
        this.deps.logger.warn(
          { listId: id, code: error instanceof AppError ? error.code : undefined },
          'Steam sync of a game failed',
        )
      }
    }
    return synced
  }

  /** Checks every hour for games due for a sync. Does nothing without Steam or when off. */
  start(): void {
    if (!this.deps.client || this.deps.syncHours === 0) return
    const check = () => {
      this.running ??= this.syncDue()
        .then((synced) => {
          if (synced > 0) this.deps.logger.info({ games: synced }, 'Synced games with Steam')
        })
        .catch((error: unknown) => this.deps.logger.error({ err: error }, 'Steam sync failed'))
        .finally(() => {
          this.running = undefined
        })
    }
    this.firstCheck = setTimeout(check, FIRST_CHECK_MS)
    this.firstCheck.unref()
    this.timer = setInterval(check, Math.min(HOUR_MS, this.deps.syncHours * HOUR_MS))
    this.timer.unref()
  }

  async stop(): Promise<void> {
    clearTimeout(this.firstCheck)
    clearInterval(this.timer)
    await this.running
  }

  private async syncGame(listId: string): Promise<SteamSyncResult> {
    const client = this.requireClient()
    const game = this.deps.db
      .select({ appId: lists.steamAppId, owner: users })
      .from(lists)
      .innerJoin(listMembers, and(eq(listMembers.listId, lists.id), eq(listMembers.role, 'owner')))
      .innerJoin(users, eq(users.id, listMembers.userId))
      .where(and(eq(lists.id, listId), isNull(lists.deletedAt)))
      .get()
    if (!game?.appId) throw new AppError(409, 'steam_game_not_found')
    const { owner, appId } = game
    if (!owner.steamId) throw new AppError(409, 'steam_not_linked')

    const [schema, percentages, unlocked] = await Promise.all([
      client.achievements(appId, owner.locale),
      client.globalPercentages(appId),
      client.playerAchievements(owner.steamId, appId),
    ])
    if (unlocked === 'private') throw new AppError(409, 'steam_profile_private')

    const known = new Set(
      this.deps.db
        .select({ apiName: achievements.apiName })
        .from(achievements)
        .where(eq(achievements.listId, listId))
        .all()
        .map((row) => row.apiName),
    )
    const added = schema.filter((achievement) => !known.has(achievement.apiName))
    const written: StoredImage[] = []
    try {
      const icons = await this.fetchIcons(added, written)
      const result = this.deps.db.transaction((tx) => {
        const now = this.deps.now()
        for (const image of written) this.deps.images.record(tx, listId, 'icon', image)

        // Newly unlocked: open goals whose achievement Steam now reports as done.
        const rows = tx
          .select({ apiName: achievements.apiName, task: tasks })
          .from(achievements)
          .innerJoin(tasks, eq(tasks.id, achievements.taskId))
          .where(eq(achievements.listId, listId))
          .all()
        let unlockedCount = 0
        for (const { apiName, task } of rows) {
          const percent = percentages.get(apiName)
          if (percent !== undefined) {
            tx.update(achievements)
              .set({ percent })
              .where(and(eq(achievements.listId, listId), eq(achievements.apiName, apiName)))
              .run()
          }
          const doneAt = unlockedAt(unlocked.get(apiName), now)
          if (!doneAt || task.completedAt || task.deletedAt) continue
          tx.update(tasks)
            .set({
              completedAt: doneAt,
              completedBy: owner.id,
              // Only open tasks carry a repeat rule; an unlocked achievement does not repeat.
              recurrence: null,
              updatedAt: now,
            })
            .where(eq(tasks.id, task.id))
            .run()
          unlockedCount++
        }

        // Achievements the game gained go to the end of the list.
        const last = tx
          .select({ position: tasks.position })
          .from(tasks)
          .where(eq(tasks.listId, listId))
          .orderBy(asc(tasks.position))
          .all()
          .at(-1)?.position
        const positions = added.length > 0 ? keysBetween(last ?? null, null, added.length) : []
        added.forEach((achievement, index) => {
          this.addGoal(tx, {
            listId,
            achievement,
            position: positions[index]!,
            iconImageId: icons.get(achievement.apiName)?.id ?? null,
            percent: percentages.get(achievement.apiName) ?? null,
            unlockedAt: unlockedAt(unlocked.get(achievement.apiName), now),
            owner,
          })
        })
        tx.update(lists).set({ steamSyncedAt: now }).where(eq(lists.id, listId)).run()
        return { unlocked: unlockedCount, added: added.length }
      })
      this.deps.events.listsChanged([listId])
      return result
    } catch (error) {
      await Promise.all(written.map((image) => this.deps.images.discard(image.id)))
      throw error
    }
  }

  private addGoal(
    tx: Executor,
    goal: {
      listId: string
      achievement: SchemaAchievement
      position: string
      iconImageId: string | null
      percent: number | null
      unlockedAt: Date | null
      owner: UserRow
    },
  ): void {
    const now = this.deps.now()
    const id = uuidv7(now.getTime())
    const { achievement } = goal
    tx.insert(tasks)
      .values({
        id,
        listId: goal.listId,
        title: achievement.displayName.slice(0, TASK_TITLE_MAX_LENGTH),
        notes: achievement.description.slice(0, TASK_NOTES_MAX_LENGTH),
        position: goal.position,
        completedAt: goal.unlockedAt,
        completedBy: goal.unlockedAt ? goal.owner.id : null,
        createdBy: goal.owner.id,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    tx.insert(achievements)
      .values({
        listId: goal.listId,
        apiName: achievement.apiName,
        taskId: id,
        iconImageId: goal.iconImageId,
        percent: goal.percent,
        hidden: achievement.hidden,
      })
      .run()
    this.deps.search.reindex(id, tx)
  }

  /** Downloads the icons of achievements; missing ones are left out. */
  private async fetchIcons(
    schema: SchemaAchievement[],
    written: StoredImage[],
  ): Promise<Map<string, StoredImage>> {
    const icons = new Map<string, StoredImage>()
    const queue = schema.filter((achievement) => achievement.iconUrl)
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const image = await this.fetchImage(next.iconUrl!, ICON_MAX_BYTES, written)
        if (image) icons.set(next.apiName, image)
      }
    }
    await Promise.all(Array.from({ length: DOWNLOADS_IN_PARALLEL }, worker))
    return icons
  }

  private async fetchImage(
    url: string,
    maxBytes: number,
    written: StoredImage[],
  ): Promise<StoredImage | null> {
    const content = await this.requireClient().download(url, maxBytes)
    if (!content) return null
    try {
      const image = await this.deps.images.write(content)
      written.push(image)
      return image
    } catch {
      // Not a picture after all; the goal simply has no icon.
      return null
    }
  }

  /** Steam games the user already imported, by app id. */
  private importedGames(userId: string): Map<number, string> {
    const rows = this.deps.db
      .select({ id: lists.id, appId: lists.steamAppId })
      .from(lists)
      .innerJoin(listMembers, eq(listMembers.listId, lists.id))
      .where(
        and(
          eq(listMembers.userId, userId),
          eq(listMembers.role, 'owner'),
          isNotNull(lists.steamAppId),
          isNull(lists.deletedAt),
        ),
      )
      .all()
    return new Map(rows.map((row) => [row.appId!, row.id]))
  }

  private requireClient(): SteamClient {
    if (!this.deps.client) throw new AppError(404, 'steam_not_configured')
    return this.deps.client
  }

  private requireSteamId(user: UserRow): string {
    if (!user.steamId) throw new AppError(409, 'steam_not_linked')
    return user.steamId
  }
}

/** When an achievement counts as done: its unlock time, or now if Steam has none. */
function unlockedAt(
  achievement: { achieved: boolean; unlockedAt: Date | null } | undefined,
  now: Date,
): Date | null {
  if (!achievement?.achieved) return null
  return achievement.unlockedAt ?? now
}

type ProfileReference = { kind: 'id' | 'vanity'; value: string }

/**
 * What someone may paste to name a Steam profile: a SteamID64, a custom
 * profile name, or a link to either (`steamcommunity.com/profiles/…` or `/id/…`).
 */
export function parseProfileReference(input: string): ProfileReference | null {
  const value = input.trim()
  if (STEAM_ID.test(value)) return { kind: 'id', value }
  if (/steamcommunity\.com/i.test(value)) {
    let url: URL
    try {
      url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    } catch {
      return null
    }
    if (!/(^|\.)steamcommunity\.com$/i.test(url.hostname)) return null
    const [kind, name] = url.pathname.split('/').filter(Boolean)
    if (kind === 'profiles' && name && STEAM_ID.test(name)) return { kind: 'id', value: name }
    if (kind === 'id' && name && VANITY_NAME.test(name)) return { kind: 'vanity', value: name }
    return null
  }
  return VANITY_NAME.test(value) ? { kind: 'vanity', value } : null
}
