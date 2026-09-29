import { z } from 'zod'

import { timestampSchema } from './common.js'

/** A backup file of the database. */
export const backupSchema = z.object({
  /** File name, e.g. `crystal-2026-09-29T03-00-00Z.db`. */
  name: z.string(),
  size: z.int(),
  createdAt: timestampSchema,
})
export type Backup = z.infer<typeof backupSchema>

export const backupStatusSchema = z.object({
  /** Hours between automatic backups; 0 when they are off. */
  intervalHours: z.int(),
  /** How many backups are kept. */
  retention: z.int(),
  /** Where the backups are stored on the server. */
  directory: z.string(),
  /** Newest first. */
  backups: z.array(backupSchema),
})
export type BackupStatus = z.infer<typeof backupStatusSchema>
