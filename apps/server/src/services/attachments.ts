import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ATTACHMENT_NAME_MAX_LENGTH,
  ATTACHMENTS_PER_TASK_MAX,
  uuidv7,
  type Attachment,
} from '@crystal/shared'
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'

import type { Config } from '../config.js'
import type { Db } from '../db/client.js'
import { attachments, tasks, type AttachmentRow, type UserRow } from '../db/schema.js'
import type { Executor } from '../db/types.js'
import { AppError, notFound } from '../lib/errors.js'
import { detectAttachmentType } from '../lib/file-type.js'
import type { EventHub } from './events.js'
import type { ListService } from './lists.js'

const PARTIAL = '.partial'
const HOUR_MS = 60 * 60 * 1000

/**
 * Images and PDFs attached to tasks. Files are stored under their id, so a
 * file name chosen by the uploader never touches the file system.
 */
export class AttachmentService {
  constructor(
    private readonly db: Db,
    private readonly lists: ListService,
    private readonly events: EventHub,
    private readonly config: Config['attachments'],
    private readonly now: () => Date,
  ) {}

  /** Attachments of the given tasks, oldest first. */
  forTasks(taskIds: readonly string[], executor: Executor = this.db): Map<string, Attachment[]> {
    const byTask = new Map<string, Attachment[]>()
    if (taskIds.length === 0) return byTask
    for (const row of executor
      .select()
      .from(attachments)
      .where(inArray(attachments.taskId, [...taskIds]))
      .orderBy(asc(attachments.createdAt), asc(attachments.id))
      .all()) {
      byTask.set(row.taskId, [...(byTask.get(row.taskId) ?? []), toAttachment(row)])
    }
    return byTask
  }

  async upload(user: UserRow, taskId: string, file: File): Promise<Attachment> {
    const task = this.findTask(taskId)
    this.lists.requireRole(user.id, task.listId, 'editor')
    const existing =
      this.db
        .select({ value: count() })
        .from(attachments)
        .where(eq(attachments.taskId, taskId))
        .get()?.value ?? 0
    if (existing >= ATTACHMENTS_PER_TASK_MAX) throw new AppError(400, 'too_many_attachments')
    if (file.size > this.config.maxBytes) throw new AppError(413, 'payload_too_large')

    const content = new Uint8Array(await file.arrayBuffer())
    const mimeType = detectAttachmentType(content)
    if (!mimeType) throw new AppError(400, 'unsupported_file')

    const now = this.now()
    const id = uuidv7(now.getTime())
    const path = this.pathOf(id)
    await mkdir(this.config.directory, { recursive: true })
    await writeFile(`${path}${PARTIAL}`, content)
    await rename(`${path}${PARTIAL}`, path)

    let row: AttachmentRow
    try {
      row = this.db.transaction((tx) => {
        // Access may have changed while the file was written.
        const current = this.findTask(taskId, tx)
        this.lists.requireRole(user.id, current.listId, 'editor', tx)
        tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, taskId)).run()
        return tx
          .insert(attachments)
          .values({
            id,
            taskId,
            fileName: cleanFileName(file.name),
            mimeType,
            size: content.byteLength,
            uploadedBy: user.id,
            createdAt: now,
          })
          .returning()
          .get()
      })
    } catch (error) {
      await rm(path, { force: true })
      throw error
    }
    this.events.listsChanged([task.listId])
    return toAttachment(row)
  }

  /** The attachment and where its content is, if the user can see its task. */
  find(user: UserRow, attachmentId: string): { attachment: AttachmentRow; path: string } {
    const row = this.db
      .select({ attachment: attachments, listId: tasks.listId })
      .from(attachments)
      .innerJoin(tasks, eq(tasks.id, attachments.taskId))
      .where(and(eq(attachments.id, attachmentId), isNull(tasks.deletedAt)))
      .get()
    if (!row || !this.lists.roleOf(user.id, row.listId)) throw notFound()
    return { attachment: row.attachment, path: this.pathOf(row.attachment.id) }
  }

  async delete(user: UserRow, attachmentId: string): Promise<void> {
    const { attachment } = this.find(user, attachmentId)
    const task = this.findTask(attachment.taskId)
    this.lists.requireRole(user.id, task.listId, 'editor')
    this.db.transaction((tx) => {
      tx.delete(attachments).where(eq(attachments.id, attachmentId)).run()
      tx.update(tasks).set({ updatedAt: this.now() }).where(eq(tasks.id, task.id)).run()
    })
    await rm(this.pathOf(attachmentId), { force: true })
    this.events.listsChanged([task.listId])
  }

  /**
   * Deletes files whose attachment is gone – their task or list was deleted for
   * good – and uploads that were interrupted. Runs with the hourly cleanup.
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
        .select({ id: attachments.id })
        .from(attachments)
        .all()
        .map((row) => row.id),
    )
    let removed = 0
    for (const name of names) {
      const path = join(this.config.directory, name)
      if (name.endsWith(PARTIAL)) {
        // Only if old enough that no upload can still be writing it. File times
        // are wall-clock times, so compare with the wall clock.
        const { mtimeMs } = await stat(path)
        if (Date.now() - mtimeMs < HOUR_MS) continue
      } else if (known.has(name)) {
        continue
      }
      await rm(path, { force: true })
      removed++
    }
    return removed
  }

  private pathOf(id: string): string {
    return join(this.config.directory, id)
  }

  private findTask(taskId: string, executor: Executor = this.db) {
    const task = executor
      .select({ id: tasks.id, listId: tasks.listId })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
      .get()
    if (!task) throw notFound()
    return task
  }
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
  }
}

/** The last path segment, without control characters, of a sensible length. */
export function cleanFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? ''
  const cleaned = base
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, ATTACHMENT_NAME_MAX_LENGTH)
  return cleaned || 'attachment'
}

/**
 * `Content-Disposition` with an ASCII fallback and the exact UTF-8 name
 * (RFC 6266 / RFC 5987), so names like `Rechnung März.pdf` survive.
 */
export function contentDisposition(kind: 'inline' | 'attachment', fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
