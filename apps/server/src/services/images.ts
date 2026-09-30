import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  COVER_MAX_BYTES,
  IMAGE_TYPES,
  uuidv7,
  type ImageKind,
  type ImageType,
} from '@crystal/shared'
import { and, eq, isNull } from 'drizzle-orm'

import type { Config } from '../config.js'
import type { Db } from '../db/client.js'
import { images, lists, type ImageRow, type UserRow } from '../db/schema.js'
import type { Executor } from '../db/types.js'
import { AppError, notFound } from '../lib/errors.js'
import { detectAttachmentType } from '../lib/file-type.js'
import type { EventHub } from './events.js'
import type { ListService } from './lists.js'

const PARTIAL = '.partial'
const HOUR_MS = 60 * 60 * 1000

/** A picture ready to be recorded: its file is written, its row is not yet. */
export interface StoredImage {
  id: string
  mimeType: ImageType
  size: number
}

/**
 * Pictures that belong to lists, such as a game's cover. Files are stored under
 * their id; access follows the list they belong to.
 */
export class ImageService {
  constructor(
    private readonly db: Db,
    private readonly lists: ListService,
    private readonly events: EventHub,
    private readonly config: Config['images'],
    private readonly now: () => Date,
  ) {}

  /** Sets (or replaces) the cover of a list. Only its owner may. */
  async setCover(user: UserRow, listId: string, file: File): Promise<void> {
    this.lists.requireRole(user.id, listId, 'owner')
    if (file.size > COVER_MAX_BYTES) throw new AppError(413, 'payload_too_large')
    const stored = await this.write(new Uint8Array(await file.arrayBuffer()))
    let previous: string | null = null
    try {
      this.db.transaction((tx) => {
        // Access may have changed while the file was written.
        this.lists.requireRole(user.id, listId, 'owner', tx)
        previous = this.coverOf(listId, tx)
        this.record(tx, listId, 'cover', stored)
        tx.update(lists)
          .set({ coverImageId: stored.id, updatedAt: this.now() })
          .where(eq(lists.id, listId))
          .run()
        if (previous) tx.delete(images).where(eq(images.id, previous)).run()
      })
    } catch (error) {
      await rm(this.pathOf(stored.id), { force: true })
      throw error
    }
    if (previous) await rm(this.pathOf(previous), { force: true })
    this.events.listsChanged([listId])
  }

  async removeCover(user: UserRow, listId: string): Promise<void> {
    this.lists.requireRole(user.id, listId, 'owner')
    const previous = this.db.transaction((tx) => {
      const id = this.coverOf(listId, tx)
      if (!id) return null
      tx.update(lists)
        .set({ coverImageId: null, updatedAt: this.now() })
        .where(eq(lists.id, listId))
        .run()
      tx.delete(images).where(eq(images.id, id)).run()
      return id
    })
    if (!previous) return
    await rm(this.pathOf(previous), { force: true })
    this.events.listsChanged([listId])
  }

  /** The image and where its content is, if the user can see its list. */
  find(user: UserRow, imageId: string): { image: ImageRow; path: string } {
    const row = this.db
      .select({ image: images })
      .from(images)
      .innerJoin(lists, eq(lists.id, images.listId))
      .where(and(eq(images.id, imageId), isNull(lists.deletedAt)))
      .get()
    if (!row || !this.lists.roleOf(user.id, row.image.listId)) throw notFound()
    return { image: row.image, path: this.pathOf(row.image.id) }
  }

  /**
   * Checks and writes an image file. The caller records it with `record` in
   * its own transaction, or deletes the file with `discard` if that fails.
   */
  async write(content: Uint8Array): Promise<StoredImage> {
    const detected = detectAttachmentType(content)
    const mimeType = IMAGE_TYPES.find((type) => type === detected)
    if (!mimeType) throw new AppError(400, 'unsupported_file')
    const id = uuidv7(this.now().getTime())
    const path = this.pathOf(id)
    await mkdir(this.config.directory, { recursive: true })
    await writeFile(`${path}${PARTIAL}`, content)
    await rename(`${path}${PARTIAL}`, path)
    return { id, mimeType, size: content.byteLength }
  }

  record(tx: Executor, listId: string, kind: ImageKind, stored: StoredImage): void {
    tx.insert(images)
      .values({ ...stored, listId, kind, createdAt: this.now() })
      .run()
  }

  async discard(imageId: string): Promise<void> {
    await rm(this.pathOf(imageId), { force: true })
  }

  /**
   * Deletes files whose image is gone – their list was deleted for good – and
   * files that were never recorded. Runs with the hourly cleanup.
   */
  async removeOrphans(): Promise<number> {
    let names: string[]
    try {
      names = await readdir(this.config.directory)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
      throw error
    }
    const known = new Set(
      this.db
        .select({ id: images.id })
        .from(images)
        .all()
        .map((row) => row.id),
    )
    let removed = 0
    for (const name of names) {
      if (known.has(name)) continue
      const path = join(this.config.directory, name)
      // Only if old enough that nothing can still be writing or recording it.
      // File times are wall-clock times, so compare with the wall clock.
      const { mtimeMs } = await stat(path)
      if (Date.now() - mtimeMs < HOUR_MS) continue
      await rm(path, { force: true })
      removed++
    }
    return removed
  }

  private coverOf(listId: string, executor: Executor): string | null {
    return (
      executor.select({ id: lists.coverImageId }).from(lists).where(eq(lists.id, listId)).get()
        ?.id ?? null
    )
  }

  private pathOf(id: string): string {
    return join(this.config.directory, id)
  }
}
