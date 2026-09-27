import { z } from 'zod'

import { INVITE_MAX_DAYS, INVITE_MAX_USES, INVITE_NOTE_MAX_LENGTH } from '../constants.js'
import { idSchema, passwordSchema, roleSchema, timestampSchema } from './common.js'

export const adminUserSchema = z.object({
  id: idSchema,
  username: z.string(),
  displayName: z.string(),
  email: z.string().nullable(),
  role: roleSchema,
  disabled: z.boolean(),
  hasPassword: z.boolean(),
  ssoLinked: z.boolean(),
  createdAt: timestampSchema,
  lastLoginAt: timestampSchema.nullable(),
})
export type AdminUser = z.infer<typeof adminUserSchema>

export const adminUpdateUserSchema = z
  .object({
    role: roleSchema,
    disabled: z.boolean(),
    /** Sets a new password and signs the user out everywhere. */
    password: passwordSchema,
  })
  .partial()
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>

export const INVITE_STATUSES = ['active', 'used', 'expired', 'revoked'] as const
export type InviteStatus = (typeof INVITE_STATUSES)[number]

export const inviteSchema = z.object({
  id: idSchema,
  role: roleSchema,
  note: z.string().nullable(),
  maxUses: z.int(),
  uses: z.int(),
  status: z.enum(INVITE_STATUSES),
  expiresAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  createdBy: z.string().nullable(),
})
export type Invite = z.infer<typeof inviteSchema>

export const createInviteSchema = z.object({
  role: roleSchema,
  maxUses: z.int().min(1).max(INVITE_MAX_USES),
  /** `null` creates an invite that never expires. */
  expiresInDays: z.int().min(1).max(INVITE_MAX_DAYS).nullable(),
  note: z.string().trim().max(INVITE_NOTE_MAX_LENGTH).optional(),
})
export type CreateInviteInput = z.infer<typeof createInviteSchema>

/** The token is only ever returned once, right after creation. */
export const createdInviteSchema = inviteSchema.extend({
  token: z.string(),
})
export type CreatedInvite = z.infer<typeof createdInviteSchema>
