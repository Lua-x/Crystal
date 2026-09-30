import { MAPS_PER_LIST_MAX, uuidv7, type GameMap, type UpdateMapInput } from '@crystal/shared'
import { and, asc, count, eq, isNull } from 'drizzle-orm'

import type { Config } from '../config.js'
import type { Db } from '../db/client.js'
import { images, lists, maps, type MapRow, type UserRow } from '../db/schema.js'
import { AppError, notFound } from '../lib/errors.js'
import { imageSize } from '../lib/file-type.js'
import { positionAtEnd } from '../lib/ordering.js'
import type { EventHub } from './events.js'
import type { ImageService } from './images.js'
import type { ListService } from './lists.js'

/**
 * Maps of games. Everyone with access to a game sees its maps; people who can
 * edit it add, rename and remove them, and pin goals to them (see `TaskService`).
 */
export class MapService {
  constructor(
    private readonly db: Db,
    private readonly lists: ListService,
    private readonly images: ImageService,
    private readonly events: EventHub,
    private readonly config: Config['images'],
    private readonly now: () => Date,
  ) {}

  forList(user: UserRow, listId: string): GameMap[] {
    this.lists.requireRole(user.id, listId, 'viewer')
    return this.db
      .select()
      .from(maps)
      .where(eq(maps.listId, listId))
      .orderBy(asc(maps.position), asc(maps.id))
      .all()
      .map(toGameMap)
  }

  async create(user: UserRow, listId: string, file: File, name: string): Promise<GameMap> {
    this.lists.requireRole(user.id, listId, 'editor')
    if (file.size > this.config.mapMaxBytes) throw new AppError(413, 'payload_too_large')
    this.requireRoom(listId)
    const content = new Uint8Array(await file.arrayBuffer())
    const stored = await this.images.write(content)
    const dimensions = imageSize(content)
    let row: MapRow
    try {
      row = this.db.transaction((tx) => {
        // Access and room may have changed while the file was written.
        this.lists.requireRole(user.id, listId, 'editor', tx)
        this.requireRoom(listId, tx)
        this.images.record(tx, listId, 'map', stored)
        const now = this.now()
        const existing = tx
          .select({ id: maps.id, position: maps.position })
          .from(maps)
          .where(eq(maps.listId, listId))
          .orderBy(asc(maps.position))
          .all()
        return tx
          .insert(maps)
          .values({
            id: uuidv7(now.getTime()),
            listId,
            name,
            imageId: stored.id,
            width: dimensions?.width ?? null,
            height: dimensions?.height ?? null,
            position: positionAtEnd(existing),
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get()
      })
    } catch (error) {
      await this.images.discard(stored.id)
      throw error
    }
    this.events.listsChanged([listId])
    return toGameMap(row)
  }

  rename(user: UserRow, mapId: string, input: UpdateMapInput): GameMap {
    const map = this.find(user, mapId)
    this.lists.requireRole(user.id, map.listId, 'editor')
    const row = this.db
      .update(maps)
      .set({ name: input.name, updatedAt: this.now() })
      .where(eq(maps.id, mapId))
      .returning()
      .get()
    this.events.listsChanged([map.listId])
    return toGameMap(row)
  }

  /** Removes the map with its picture; the goals pinned to it stay, without a place. */
  async delete(user: UserRow, mapId: string): Promise<void> {
    const map = this.find(user, mapId)
    this.lists.requireRole(user.id, map.listId, 'editor')
    // The map and its pins follow their picture.
    this.db.delete(images).where(eq(images.id, map.imageId)).run()
    await this.images.discard(map.imageId)
    this.events.listsChanged([map.listId])
  }

  /** The map, if the user can see its game. */
  private find(user: UserRow, mapId: string): MapRow {
    const row = this.db
      .select({ map: maps })
      .from(maps)
      .innerJoin(lists, eq(lists.id, maps.listId))
      .where(and(eq(maps.id, mapId), isNull(lists.deletedAt)))
      .get()
    if (!row || !this.lists.roleOf(user.id, row.map.listId)) throw notFound()
    return row.map
  }

  private requireRoom(listId: string, executor: Pick<Db, 'select'> = this.db): void {
    const existing =
      executor.select({ value: count() }).from(maps).where(eq(maps.listId, listId)).get()?.value ??
      0
    if (existing >= MAPS_PER_LIST_MAX) throw new AppError(409, 'too_many_maps')
  }
}

function toGameMap(row: MapRow): GameMap {
  return {
    id: row.id,
    listId: row.listId,
    name: row.name,
    imageId: row.imageId,
    width: row.width,
    height: row.height,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
  }
}
