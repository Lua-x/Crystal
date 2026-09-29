import { z } from 'zod'

import { timestampSchema } from './common.js'

/** A private, read-only calendar link with the user's due tasks. */
export const calendarFeedSchema = z.object({
  /** The feed's path on this instance, e.g. `/api/calendar/<secret>.ics`. */
  path: z.string(),
  createdAt: timestampSchema,
  lastUsedAt: timestampSchema.nullable(),
})
export type CalendarFeed = z.infer<typeof calendarFeedSchema>
