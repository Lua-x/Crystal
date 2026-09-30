import type { Locale } from '@crystal/shared'

import type { SteamConfig } from '../config.js'
import { AppError } from '../lib/errors.js'

const TIMEOUT_MS = 15_000
/** Generous for the largest libraries and achievement lists. */
const MAX_JSON_BYTES = 10 * 1024 * 1024
const MAX_REDIRECTS = 3
/** Hosts Steam serves pictures from. */
const MEDIA_HOST = /(^|\.)steamstatic\.com$|^steamcdn-a\.akamaihd\.net$/

const LANGUAGES: Record<Locale, string> = { de: 'german', en: 'english' }

export interface OwnedGame {
  appId: number
  name: string
  playtimeMinutes: number
}

export interface SchemaAchievement {
  apiName: string
  displayName: string
  description: string
  iconUrl: string | null
  hidden: boolean
}

export interface PlayerAchievement {
  achieved: boolean
  unlockedAt: Date | null
}

/**
 * The parts of the Steam Web API and store Crystal uses. Only fixed endpoints
 * are called; pictures are only downloaded from Steam's media hosts. The API
 * key is sent as a query parameter (as Steam requires) and never logged: errors
 * carry no URLs.
 */
export class SteamClient {
  constructor(
    private readonly config: SteamConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** The SteamID64 behind a custom profile name, or `null` if there is none. */
  async resolveVanityName(name: string): Promise<string | null> {
    const body = await this.api('ISteamUser/ResolveVanityURL/v1', { vanityurl: name })
    const response = object(object(body).response)
    return response.success === 1 && typeof response.steamid === 'string' ? response.steamid : null
  }

  /** The profile's display name, or `null` if the account does not exist. */
  async playerName(steamId: string): Promise<string | null> {
    const body = await this.api('ISteamUser/GetPlayerSummaries/v2', { steamids: steamId })
    const players = array(object(object(body).response).players)
    const player = object(players.find((item) => object(item).steamid === steamId))
    return typeof player.personaname === 'string' ? player.personaname : null
  }

  /** The games in a library, or `null` when the profile keeps its games private. */
  async ownedGames(steamId: string): Promise<OwnedGame[] | null> {
    const body = await this.api('IPlayerService/GetOwnedGames/v1', {
      steamid: steamId,
      include_appinfo: '1',
      include_played_free_games: '1',
    })
    const response = object(object(body).response)
    // Private libraries answer with an empty object.
    if (!Array.isArray(response.games)) return response.game_count === 0 ? [] : null
    return response.games.flatMap((item) => {
      const game = object(item)
      if (typeof game.appid !== 'number' || typeof game.name !== 'string') return []
      const playtime = typeof game.playtime_forever === 'number' ? game.playtime_forever : 0
      return [{ appId: game.appid, name: game.name, playtimeMinutes: playtime }]
    })
  }

  /** The achievements a game has, in Steam's order; empty if it has none. */
  async achievements(appId: number, locale: Locale): Promise<SchemaAchievement[]> {
    const body = await this.api(
      'ISteamUserStats/GetSchemaForGame/v2',
      { appid: String(appId), l: LANGUAGES[locale] },
      // Unknown apps answer 400 or 403 without any stats.
      [400, 403],
    )
    const stats = object(object(object(body).game).availableGameStats)
    return array(stats.achievements).flatMap((item) => {
      const achievement = object(item)
      if (typeof achievement.name !== 'string') return []
      const displayName =
        typeof achievement.displayName === 'string' && achievement.displayName.trim()
          ? achievement.displayName.trim()
          : achievement.name
      return [
        {
          apiName: achievement.name,
          displayName,
          description:
            typeof achievement.description === 'string' ? achievement.description.trim() : '',
          iconUrl: typeof achievement.icon === 'string' ? achievement.icon : null,
          hidden: achievement.hidden === 1 || achievement.hidden === true,
        },
      ]
    })
  }

  /** Share of all players who unlocked each achievement, 0–100. */
  async globalPercentages(appId: number): Promise<Map<string, number>> {
    const body = await this.api(
      'ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2',
      { gameid: String(appId) },
      [400, 403, 404],
      false,
    )
    const list = array(object(object(body).achievementpercentages).achievements)
    const percentages = new Map<string, number>()
    for (const item of list) {
      const entry = object(item)
      // Newer answers send the percentage as a string.
      const percent = Number(entry.percent)
      if (typeof entry.name === 'string' && Number.isFinite(percent)) {
        percentages.set(entry.name, Math.min(100, Math.max(0, percent)))
      }
    }
    return percentages
  }

  /**
   * Which achievements a player unlocked, and when. `private` when the profile
   * hides its game details; an empty map when the player has no stats for the
   * game (for example because they do not own it).
   */
  async playerAchievements(
    steamId: string,
    appId: number,
  ): Promise<Map<string, PlayerAchievement> | 'private'> {
    const body = await this.api(
      'ISteamUserStats/GetPlayerAchievements/v1',
      { steamid: steamId, appid: String(appId) },
      [400, 403],
    )
    const stats = object(object(body).playerstats)
    if (stats.success !== true) {
      const error = typeof stats.error === 'string' ? stats.error.toLowerCase() : ''
      return error.includes('not public') ? 'private' : new Map()
    }
    const unlocked = new Map<string, PlayerAchievement>()
    for (const item of array(stats.achievements)) {
      const entry = object(item)
      if (typeof entry.apiname !== 'string') continue
      const time = typeof entry.unlocktime === 'number' ? entry.unlocktime : 0
      unlocked.set(entry.apiname, {
        achieved: entry.achieved === 1,
        unlockedAt: entry.achieved === 1 && time > 0 ? new Date(time * 1000) : null,
      })
    }
    return unlocked
  }

  /** The game's name and header picture from the store, if the store knows it. */
  async storeDetails(
    appId: number,
    locale: Locale,
  ): Promise<{ name: string; headerUrl: string | null } | null> {
    const url = new URL('/api/appdetails', this.config.storeUrl)
    url.searchParams.set('appids', String(appId))
    url.searchParams.set('filters', 'basic')
    url.searchParams.set('l', LANGUAGES[locale])
    let body: unknown
    try {
      body = await this.json(url, [400, 403, 404])
    } catch {
      // The store is only used for the name and cover; the import works without it.
      return null
    }
    const entry = object(object(body)[String(appId)])
    const data = object(entry.data)
    if (entry.success !== true || typeof data.name !== 'string') return null
    return {
      name: data.name,
      headerUrl: typeof data.header_image === 'string' ? data.header_image : null,
    }
  }

  /**
   * Downloads a picture from Steam's media hosts; `null` when it is missing,
   * too large or somewhere else. Every redirect is checked again.
   */
  async download(address: string, maxBytes: number): Promise<Uint8Array | null> {
    let url: URL
    try {
      url = new URL(address)
    } catch {
      return null
    }
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!this.isMediaUrl(url)) return null
      let response: Response
      try {
        response = await this.fetchImpl(url, {
          redirect: 'manual',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch {
        return null
      }
      const location = response.headers.get('location')
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel()
        url = new URL(location, url)
        continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        return null
      }
      return readLimited(response, maxBytes)
    }
    return null
  }

  private isMediaUrl(url: URL): boolean {
    // A configured test server may serve pictures, too (then also over plain HTTP).
    if (url.origin === this.config.apiUrl.origin || url.origin === this.config.storeUrl.origin) {
      return true
    }
    return url.protocol === 'https:' && MEDIA_HOST.test(url.hostname)
  }

  private async api(
    method: string,
    params: Record<string, string>,
    acceptedErrors: number[] = [],
    withKey = true,
  ): Promise<unknown> {
    const url = new URL(`/${method}/`, this.config.apiUrl)
    if (withKey) url.searchParams.set('key', this.config.apiKey)
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
    return this.json(url, acceptedErrors)
  }

  private async json(url: URL, acceptedErrors: number[]): Promise<unknown> {
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw new AppError(502, 'steam_unavailable')
    }
    if (!response.ok && !acceptedErrors.includes(response.status)) {
      await response.body?.cancel()
      throw new AppError(502, 'steam_unavailable', `Steam answered ${response.status}.`)
    }
    const bytes = await readLimited(response, MAX_JSON_BYTES)
    if (!bytes) throw new AppError(502, 'steam_unavailable')
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown
    } catch {
      // Error pages of rejected requests are HTML.
      if (!response.ok) return {}
      throw new AppError(502, 'steam_unavailable', 'Steam answered with something unexpected.')
    }
  }
}

/** The body, unless it is larger than `maxBytes`. */
async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get('content-length'))
  if (declared > maxBytes) {
    await response.body?.cancel()
    return null
  }
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } catch {
    return null
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

type Json = Record<string, unknown>

function object(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
