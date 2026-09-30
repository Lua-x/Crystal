import { z } from 'zod'

import { STEAM_PROFILE_INPUT_MAX_LENGTH } from '../constants.js'
import { idSchema } from './common.js'

/** A Steam account linked to a Crystal account. */
export const steamProfileSchema = z.object({
  /** The 17-digit SteamID64. */
  steamId: z.string(),
  /** The name shown on Steam when the account was linked. */
  name: z.string(),
})
export type SteamProfile = z.infer<typeof steamProfileSchema>

export const steamStatusSchema = z.object({
  /** Whether the administrator set up Steam (`STEAM_API_KEY`). */
  available: z.boolean(),
  profile: steamProfileSchema.nullable(),
})
export type SteamStatus = z.infer<typeof steamStatusSchema>

export const linkSteamSchema = z.object({
  /**
   * A profile link (`steamcommunity.com/id/…` or `/profiles/…`), a custom
   * profile name or a SteamID64.
   */
  profile: z.string().trim().min(1).max(STEAM_PROFILE_INPUT_MAX_LENGTH),
})
export type LinkSteamInput = z.infer<typeof linkSteamSchema>

/** A game in the linked Steam library. */
export const steamGameSchema = z.object({
  appId: z.int(),
  name: z.string(),
  playtimeMinutes: z.int(),
  /** The game this Steam game was already imported as, if any. */
  listId: idSchema.nullable(),
})
export type SteamGame = z.infer<typeof steamGameSchema>

export const importSteamGameSchema = z.object({
  appId: z.int().positive(),
  groupId: idSchema.nullable().optional(),
})
export type ImportSteamGameInput = z.infer<typeof importSteamGameSchema>

export const steamSyncResultSchema = z.object({
  /** Goals ticked off because the achievement is now unlocked. */
  unlocked: z.int(),
  /** Goals added for achievements the game did not have before (e.g. from DLC). */
  added: z.int(),
})
export type SteamSyncResult = z.infer<typeof steamSyncResultSchema>

/** What a goal imported from a Steam achievement knows about it. */
export const achievementSchema = z.object({
  /** The achievement's icon; load it from `/images/{id}`. */
  iconImageId: idSchema.nullable(),
  /** Share of all players who unlocked it, 0–100. */
  percent: z.number().nullable(),
  /** Steam keeps the description of hidden achievements secret until unlocked. */
  hidden: z.boolean(),
})
export type Achievement = z.infer<typeof achievementSchema>
