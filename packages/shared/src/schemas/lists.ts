import { z } from 'zod'

import {
  GROUP_NAME_MAX_LENGTH,
  LIST_COLORS,
  LIST_ICON_MAX_LENGTH,
  LIST_NAME_MAX_LENGTH,
  LIST_ROLES,
} from '../constants.js'
import { idSchema, timestampSchema } from './common.js'

export const listColorSchema = z.enum(LIST_COLORS)
export const listRoleSchema = z.enum(LIST_ROLES)
export const listNameSchema = z.string().trim().min(1).max(LIST_NAME_MAX_LENGTH)
/** An emoji (or other short symbol) shown instead of the default list icon. */
export const listIconSchema = z.string().trim().min(1).max(LIST_ICON_MAX_LENGTH)
export const groupNameSchema = z.string().trim().min(1).max(GROUP_NAME_MAX_LENGTH)

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
  /** The list new tasks from smart lists go to. It cannot be deleted. */
  isDefault: z.boolean(),
  openCount: z.int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type List = z.infer<typeof listSchema>

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
  groupId: idSchema.nullable().optional(),
})
export type CreateListInput = z.infer<typeof createListSchema>

export const updateListSchema = z
  .object({
    name: listNameSchema,
    color: listColorSchema,
    icon: listIconSchema.nullable(),
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
