import { z } from 'zod'

import { MAP_NAME_MAX_LENGTH } from '../constants.js'
import { idSchema, timestampSchema } from './common.js'

/** A picture of a game's world, with goals pinned to places on it. */
export const gameMapSchema = z.object({
  id: idSchema,
  listId: idSchema,
  name: z.string(),
  /** The picture; load it from `/images/{id}`. */
  imageId: idSchema,
  /** Size of the picture in pixels, if Crystal could read it from the file. */
  width: z.int().nullable(),
  height: z.int().nullable(),
  position: z.string(),
  createdAt: timestampSchema,
})
export type GameMap = z.infer<typeof gameMapSchema>

export const mapNameSchema = z.string().trim().min(1).max(MAP_NAME_MAX_LENGTH)

export const updateMapSchema = z.object({ name: mapNameSchema })
export type UpdateMapInput = z.infer<typeof updateMapSchema>

/** Where on a map a goal is: `x` and `y` from 0 (left, top) to 1 (right, bottom). */
export const pinSchema = z.object({
  mapId: idSchema,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})
export type Pin = z.infer<typeof pinSchema>
