import { z } from 'zod'

import {
  GROUP_NAME_MAX_LENGTH,
  LIST_COLORS,
  LIST_ICON_MAX_LENGTH,
  LIST_NAME_MAX_LENGTH,
  LIST_ROLES,
  SHARE_ROLES,
} from '../constants.js'
import { idSchema, timestampSchema } from './common.js'

export const listColorSchema = z.enum(LIST_COLORS)
export const listRoleSchema = z.enum(LIST_ROLES)
export const listNameSchema = z.string().trim().min(1).max(LIST_NAME_MAX_LENGTH)
/** An emoji (or other short symbol) shown instead of the default list icon. */
export const listIconSchema = z.string().trim().min(1).max(LIST_ICON_MAX_LENGTH)
export const groupNameSchema = z.string().trim().min(1).max(GROUP_NAME_MAX_LENGTH)
/** The day a list (in gaming mode: a game) should be finished by. */
export const listDeadlineSchema = z.iso.date()

export const listSchema = z.object({
  id: idSchema,
  name: z.string(),
  color: listColorSchema,
  icon: z.string().nullable(),
  /** The signed-in user's access to this list. */
  role: listRoleSchema,
  /** Placement in the signed-in user's sidebar. */
  groupId: idSchema.nullable(),
  position: z.string(),
  /** The list new tasks from smart lists go to. It cannot be deleted or shared. */
  isDefault: z.boolean(),
  /** Cover picture (shown for games); load it from `/images/{id}`. */
  coverImageId: idSchema.nullable(),
  /** The day the list should be finished by, if one was set. */
  deadline: listDeadlineSchema.nullable(),
  /** The Steam game whose achievements this game tracks. */
  steamAppId: z.int().nullable(),
  /** When the achievements were last compared with Steam. */
  steamSyncedAt: timestampSchema.nullable(),
  openCount: z.int(),
  completedCount: z.int(),
  /** People with access, the owner included; more than one means shared. */
  memberCount: z.int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type List = z.infer<typeof listSchema>

export const shareRoleSchema = z.enum(SHARE_ROLES)

export const listMemberSchema = z.object({
  userId: idSchema,
  username: z.string(),
  displayName: z.string(),
  role: listRoleSchema,
})
export type ListMember = z.infer<typeof listMemberSchema>

export const addListMemberSchema = z.object({
  userId: idSchema,
  role: shareRoleSchema,
})
export type AddListMemberInput = z.infer<typeof addListMemberSchema>

export const updateListMemberSchema = z.object({ role: shareRoleSchema })
export type UpdateListMemberInput = z.infer<typeof updateListMemberSchema>

/**
 * Where to put a list or group in the sidebar: inside `groupId` (or at the top
 * level for `null`), directly after the item `after` (or first for `null`). At
 * the top level, `after` may name a list or a group.
 */
export const listPlacementSchema = z.object({
  groupId: idSchema.nullable(),
  after: idSchema.nullable(),
})
export type ListPlacement = z.infer<typeof listPlacementSchema>

export const createListSchema = z.object({
  id: idSchema.optional(),
  name: listNameSchema,
  color: listColorSchema.optional(),
  icon: listIconSchema.nullable().optional(),
  deadline: listDeadlineSchema.nullable().optional(),
  groupId: idSchema.nullable().optional(),
})
export type CreateListInput = z.infer<typeof createListSchema>

export const updateListSchema = z
  .object({
    name: listNameSchema,
    color: listColorSchema,
    icon: listIconSchema.nullable(),
    deadline: listDeadlineSchema.nullable(),
    placement: listPlacementSchema,
  })
  .partial()
export type UpdateListInput = z.infer<typeof updateListSchema>

export const listGroupSchema = z.object({
  id: idSchema,
  name: z.string(),
  position: z.string(),
  collapsed: z.boolean(),
})
export type ListGroup = z.infer<typeof listGroupSchema>

export const createListGroupSchema = z.object({
  id: idSchema.optional(),
  name: groupNameSchema,
})
export type CreateListGroupInput = z.infer<typeof createListGroupSchema>

export const updateListGroupSchema = z
  .object({
    name: groupNameSchema,
    collapsed: z.boolean(),
    /** Groups live at the top level; `after` is a list or group there. */
    placement: z.object({ after: idSchema.nullable() }),
  })
  .partial()
export type UpdateListGroupInput = z.infer<typeof updateListGroupSchema>
