import { z } from 'zod'

/** How many tasks the user completed in one week (Monday to Sunday, their time zone). */
export const weekStatSchema = z.object({
  /** The Monday the week starts on, `YYYY-MM-DD`. */
  start: z.string(),
  completed: z.int(),
})

export const statsSchema = z.object({
  /** The last 12 weeks, oldest first; the last one is the current week. */
  weeks: z.array(weekStatSchema),
  streak: z.object({
    /** Days in a row with at least one completed task, up to today (or yesterday). */
    current: z.int(),
    longest: z.int(),
  }),
  completedToday: z.int(),
  completedTotal: z.int(),
  /** Open tasks in all lists the user can see. */
  open: z.int(),
  overdue: z.int(),
})
export type Stats = z.infer<typeof statsSchema>
