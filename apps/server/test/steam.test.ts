import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { List, SteamGame, SteamStatus, SteamSyncResult, Task } from '@crystal/shared'
import { afterEach, describe, expect, it } from 'vitest'

import { parseProfileReference } from '../src/services/steam.js'
import {
  createTestContext,
  errorCode,
  PASSWORD,
  registerUser,
  type TestClient,
  type TestContext,
} from './helpers.js'

const API = 'https://api.steampowered.com'
const STORE = 'https://store.steampowered.com'
const CDN = 'https://shared.akamai.steamstatic.com'
const KEY = 'steam-test-key'
const ANNA = '76561198000000001'
const HOLLOW_KNIGHT = 367520

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46])

interface FakeAchievement {
  name: string
  displayName: string
  description?: string
  hidden?: boolean
  icon?: string
}

/** Steam's Web API, store and CDN, as far as Crystal uses them. */
class FakeSteam {
  readonly requests: URL[] = []
  down = false
  vanity = new Map([['annaplays', ANNA]])
  players = new Map([[ANNA, 'Anna Plays']])
  libraries = new Map<string, Array<{ appid: number; name: string; playtime_forever: number }>>([
    [
      ANNA,
      [
        { appid: 620, name: 'Portal 2', playtime_forever: 300 },
        { appid: HOLLOW_KNIGHT, name: 'Hollow Knight', playtime_forever: 4200 },
      ],
    ],
  ])
  privateProfiles = new Set<string>()
  schemas = new Map<number, FakeAchievement[]>([
    [
      HOLLOW_KNIGHT,
      [
        {
          name: 'FALSE_KNIGHT',
          displayName: 'Falsehood',
          description: 'Defeat the False Knight',
          icon: `${CDN}/icons/false_knight.jpg`,
        },
        {
          name: 'HORNET_1',
          displayName: 'Protected',
          description: 'Defeat Hornet in Greenpath',
          icon: `${CDN}/icons/hornet.jpg`,
        },
        { name: 'RADIANCE', displayName: 'Dream No More', hidden: true },
      ],
    ],
    [620, []],
  ])
  percentages = new Map([
    [
      HOLLOW_KNIGHT,
      [
        { name: 'FALSE_KNIGHT', percent: '71.4' },
        { name: 'HORNET_1', percent: 55.2 },
        { name: 'RADIANCE', percent: 6.8 },
      ],
    ],
  ])
  /** SteamID → app → unlock times (seconds) of achieved achievements. */
  unlocked = new Map<string, Map<number, Record<string, number>>>([
    [ANNA, new Map([[HOLLOW_KNIGHT, { FALSE_KNIGHT: 1_790_000_000 }]])],
  ])
  media = new Map<string, Uint8Array>([
    [`${CDN}/icons/false_knight.jpg`, JPEG],
    [`${CDN}/icons/hornet.jpg`, PNG],
    [`${CDN}/apps/${HOLLOW_KNIGHT}/header.jpg`, JPEG],
  ])

  readonly fetch: typeof fetch = (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    this.requests.push(url)
    if (this.down) return Promise.reject(new TypeError(`fetch failed: ${url.href}`))
    return Promise.resolve(this.answer(url))
  }

  private answer(url: URL): Response {
    const query = url.searchParams
    const withKey = (body: () => Response) =>
      query.get('key') === KEY ? body() : new Response('<html>Forbidden</html>', { status: 403 })
    switch (`${url.origin}${url.pathname}`) {
      case `${API}/ISteamUser/ResolveVanityURL/v1/`:
        return withKey(() => {
          const steamid = this.vanity.get(query.get('vanityurl') ?? '')
          return json({ response: steamid ? { steamid, success: 1 } : { success: 42 } })
        })
      case `${API}/ISteamUser/GetPlayerSummaries/v2/`:
        return withKey(() => {
          const id = query.get('steamids') ?? ''
          const name = this.players.get(id)
          return json({ response: { players: name ? [{ steamid: id, personaname: name }] : [] } })
        })
      case `${API}/IPlayerService/GetOwnedGames/v1/`:
        return withKey(() => {
          const id = query.get('steamid') ?? ''
          const games = this.libraries.get(id)
          if (this.privateProfiles.has(id) || !games) return json({ response: {} })
          return json({ response: { game_count: games.length, games } })
        })
      case `${API}/ISteamUserStats/GetSchemaForGame/v2/`:
        return withKey(() => {
          const achievements = this.schemas.get(Number(query.get('appid')))
          if (!achievements) return json({}, 400)
          const language = query.get('l')
          return json({
            game: {
              gameName: 'ValveTestApp',
              availableGameStats: {
                achievements: achievements.map((achievement) => ({
                  name: achievement.name,
                  displayName:
                    language === 'german'
                      ? `${achievement.displayName} (DE)`
                      : achievement.displayName,
                  hidden: achievement.hidden ? 1 : 0,
                  ...(achievement.description ? { description: achievement.description } : {}),
                  icon: achievement.icon ?? '',
                  icongray: achievement.icon ?? '',
                })),
              },
            },
          })
        })
      case `${API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/`: {
        const list = this.percentages.get(Number(query.get('gameid')))
        return list ? json({ achievementpercentages: { achievements: list } }) : json({}, 403)
      }
      case `${API}/ISteamUserStats/GetPlayerAchievements/v1/`:
        return withKey(() => {
          const id = query.get('steamid') ?? ''
          const appId = Number(query.get('appid'))
          if (this.privateProfiles.has(id)) {
            return json({ playerstats: { error: 'Profile is not public', success: false } }, 403)
          }
          const achievements = this.schemas.get(appId)
          const done = this.unlocked.get(id)?.get(appId)
          if (!achievements || !done) {
            return json(
              { playerstats: { error: 'Requested app has no stats', success: false } },
              400,
            )
          }
          return json({
            playerstats: {
              steamID: id,
              success: true,
              achievements: achievements.map((achievement) => ({
                apiname: achievement.name,
                achieved: done[achievement.name] ? 1 : 0,
                unlocktime: done[achievement.name] ?? 0,
              })),
            },
          })
        })
      case `${STORE}/api/appdetails`: {
        const appId = query.get('appids') ?? ''
        const game = [...this.libraries.values()]
          .flat()
          .find((item) => String(item.appid) === appId)
        return json({
          [appId]: game
            ? {
                success: true,
                data: { name: game.name, header_image: `${CDN}/apps/${appId}/header.jpg` },
              }
            : { success: false },
        })
      }
      default: {
        const content = this.media.get(url.href)
        return content ? new Response(Buffer.from(content)) : new Response('', { status: 404 })
      }
    }
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let context: TestContext
let steam: FakeSteam
let dataDir: string
afterEach(async () => {
  await context.close()
  rmSync(dataDir, { recursive: true, force: true })
})

function setup(env: Record<string, string> = {}) {
  dataDir = mkdtempSync(join(tmpdir(), 'crystal-steam-'))
  steam = new FakeSteam()
  context = createTestContext(
    { REGISTRATION: 'open', DATA_DIR: dataDir, STEAM_API_KEY: KEY, ...env },
    { steamFetch: steam.fetch },
  )
  return context
}

async function linkedUser(name = 'anna', extra: Record<string, unknown> = {}) {
  const { client, me } = await registerUser(context, name, { mode: 'gaming', ...extra })
  const linked = await client.put<SteamStatus>('/api/v1/steam/profile', { profile: 'annaplays' })
  expect(linked.status, JSON.stringify(linked.body)).toBe(200)
  return { client, me }
}

async function signedIn(username: string) {
  const client = context.client()
  const response = await client.post('/api/v1/auth/login', {
    identifier: username,
    password: PASSWORD,
  })
  expect(response.status).toBe(200)
  return client
}

async function importGame(client: TestClient, appId = HOLLOW_KNIGHT) {
  return client.post<List>('/api/v1/steam/games', { appId })
}

async function goals(client: TestClient, listId: string) {
  return (await client.get<Task[]>(`/api/v1/lists/${listId}/tasks`)).body
}

describe('Steam accounts', () => {
  it('link through a profile link, a custom name or a SteamID', async () => {
    setup()
    const { client } = await registerUser(context, 'anna', { mode: 'gaming' })
    expect((await client.get<SteamStatus>('/api/v1/steam')).body).toEqual({
      available: true,
      profile: null,
    })

    for (const profile of [
      'https://steamcommunity.com/id/annaplays/',
      'steamcommunity.com/profiles/76561198000000001',
      'annaplays',
      ANNA,
    ]) {
      const linked = await client.put<SteamStatus>('/api/v1/steam/profile', { profile })
      expect(linked.status, profile).toBe(200)
      expect(linked.body.profile).toEqual({ steamId: ANNA, name: 'Anna Plays' })
    }
    expect((await client.get<SteamStatus>('/api/v1/steam')).body.profile?.name).toBe('Anna Plays')

    const unlinked = await client.delete<SteamStatus>('/api/v1/steam/profile')
    expect(unlinked.body).toEqual({ available: true, profile: null })
  })

  it('must exist', async () => {
    setup()
    const { client } = await registerUser(context, 'anna')
    for (const profile of ['nobody-here', '76561198999999999', 'https://example.org/id/anna']) {
      const response = await client.put('/api/v1/steam/profile', { profile })
      expect(response.status, profile).toBe(400)
      expect(errorCode(response)).toBe('steam_profile_not_found')
    }
  })

  it('are not available without an API key', async () => {
    setup({ STEAM_API_KEY: '' })
    const { client } = await registerUser(context, 'anna')
    expect((await client.get<SteamStatus>('/api/v1/steam')).body.available).toBe(false)
    const response = await client.put('/api/v1/steam/profile', { profile: 'annaplays' })
    expect(response.status).toBe(404)
    expect(errorCode(response)).toBe('steam_not_configured')
    expect(steam.requests).toEqual([])
  })

  it('cannot be managed with API tokens', async () => {
    setup()
    const { client } = await registerUser(context, 'anna')
    const { body } = await client.post<{ token: string }>('/api/v1/me/tokens', {
      name: 'Script',
      scope: 'write',
      expiresInDays: null,
    })
    const script = context.client({ origin: null })
    const response = await script.get('/api/v1/steam', { authorization: `Bearer ${body.token}` })
    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('token_not_allowed')
  })

  it('never reveal the API key', async () => {
    setup()
    const { client } = await registerUser(context, 'anna')
    steam.down = true
    const response = await client.put('/api/v1/steam/profile', { profile: 'annaplays' })
    expect(response.status).toBe(502)
    expect(errorCode(response)).toBe('steam_unavailable')
    expect(JSON.stringify(response.body)).not.toContain(KEY)
  })
})

describe('Steam libraries', () => {
  it('list the games, most played first', async () => {
    setup()
    const { client } = await linkedUser()
    const games = await client.get<SteamGame[]>('/api/v1/steam/games')
    expect(games.body).toEqual([
      { appId: HOLLOW_KNIGHT, name: 'Hollow Knight', playtimeMinutes: 4200, listId: null },
      { appId: 620, name: 'Portal 2', playtimeMinutes: 300, listId: null },
    ])

    const game = (await importGame(client)).body
    const again = await client.get<SteamGame[]>('/api/v1/steam/games')
    expect(again.body[0]).toMatchObject({ appId: HOLLOW_KNIGHT, listId: game.id })
  })

  it('need a linked account whose games are public', async () => {
    setup()
    const { client } = await registerUser(context, 'anna')
    const unlinked = await client.get('/api/v1/steam/games')
    expect(errorCode(unlinked)).toBe('steam_not_linked')

    await client.put('/api/v1/steam/profile', { profile: 'annaplays' })
    steam.privateProfiles.add(ANNA)
    const hidden = await client.get('/api/v1/steam/games')
    expect(hidden.status).toBe(409)
    expect(errorCode(hidden)).toBe('steam_profile_private')
  })
})

describe('importing a Steam game', () => {
  it('turns every achievement into a goal', async () => {
    setup()
    const { client } = await linkedUser()
    const imported = await importGame(client)
    expect(imported.status, JSON.stringify(imported.body)).toBe(201)
    const game = imported.body
    expect(game).toMatchObject({
      name: 'Hollow Knight',
      steamAppId: HOLLOW_KNIGHT,
      openCount: 2,
      completedCount: 1,
      steamSyncedAt: '2026-09-27T10:00:00.000Z',
    })
    expect(game.coverImageId).not.toBeNull()
    const cover = await client.download(`/api/v1/images/${game.coverImageId!}`)
    expect(cover.headers.get('content-type')).toBe('image/jpeg')

    const list = await goals(client, game.id)
    const byTitle = new Map(list.map((goal) => [goal.title, goal]))
    expect(
      [...list].sort((a, b) => (a.position < b.position ? -1 : 1)).map((goal) => goal.title),
    ).toEqual(['Falsehood', 'Protected', 'Dream No More'])

    // Unlocked on Steam: done, at the time it was unlocked.
    expect(byTitle.get('Falsehood')).toMatchObject({
      notes: 'Defeat the False Knight',
      completedAt: new Date(1_790_000_000 * 1000).toISOString(),
      achievement: { percent: 71.4, hidden: false },
    })
    expect(byTitle.get('Protected')).toMatchObject({
      completedAt: null,
      achievement: { percent: 55.2, hidden: false },
    })
    expect(byTitle.get('Dream No More')).toMatchObject({
      notes: '',
      achievement: { iconImageId: null, percent: 6.8, hidden: true },
    })

    const icon = byTitle.get('Protected')!.achievement!.iconImageId!
    const shown = await client.download(`/api/v1/images/${icon}`)
    expect(shown.headers.get('content-type')).toBe('image/png')
    // The key only ever goes to the Web API.
    for (const request of steam.requests) {
      if (request.searchParams.has('key')) expect(request.origin).toBe(API)
    }
  })

  it('uses the language of the account', async () => {
    setup()
    const { client } = await linkedUser('anna', { locale: 'de' })
    const game = (await importGame(client)).body
    const titles = (await goals(client, game.id)).map((goal) => goal.title)
    expect(titles).toContain('Falsehood (DE)')
  })

  it('happens once per game', async () => {
    setup()
    const { client } = await linkedUser()
    await importGame(client)
    const again = await importGame(client)
    expect(again.status).toBe(409)
    expect(errorCode(again)).toBe('steam_already_imported')
  })

  it('needs achievements and public game details', async () => {
    setup()
    const { client } = await linkedUser()
    const portal = await importGame(client, 620)
    expect(errorCode(portal)).toBe('steam_no_achievements')

    steam.privateProfiles.add(ANNA)
    const hidden = await importGame(client)
    expect(errorCode(hidden)).toBe('steam_profile_private')
    expect((await client.get<List[]>('/api/v1/lists')).body).toHaveLength(1)
  })

  it('only downloads pictures from Steam', async () => {
    setup()
    const { client } = await linkedUser()
    steam.schemas.get(HOLLOW_KNIGHT)![0]!.icon = 'http://169.254.169.254/latest/meta-data'
    steam.schemas.get(HOLLOW_KNIGHT)![1]!.icon = 'https://steamstatic.com.evil.example/icon.jpg'
    const game = (await importGame(client)).body
    const icons = (await goals(client, game.id)).map((goal) => goal.achievement?.iconImageId)
    expect(icons).toEqual([null, null, null])
    expect(steam.requests.map((request) => request.hostname)).not.toContain('169.254.169.254')
    expect(steam.requests.map((request) => request.hostname)).not.toContain(
      'steamstatic.com.evil.example',
    )
  })
})

describe('syncing with Steam', () => {
  async function importedGame() {
    setup()
    const { client, me } = await linkedUser()
    const game = (await importGame(client)).body
    return { client, me, game }
  }

  it('ticks off what was unlocked since', async () => {
    const { client, game } = await importedGame()
    steam.unlocked.get(ANNA)!.get(HOLLOW_KNIGHT)!.HORNET_1 = 1_790_500_000
    steam.percentages.get(HOLLOW_KNIGHT)![1]!.percent = 57

    context.clock.advance(60_000)
    const synced = await client.post<SteamSyncResult>(`/api/v1/lists/${game.id}/steam-sync`)
    expect(synced.body).toEqual({ unlocked: 1, added: 0 })

    const hornet = (await goals(client, game.id)).find((goal) => goal.title === 'Protected')
    expect(hornet).toMatchObject({
      completedAt: new Date(1_790_500_000 * 1000).toISOString(),
      achievement: { percent: 57 },
    })
    const updated = (await client.get<List[]>('/api/v1/lists')).body.find(
      (list) => list.id === game.id,
    )
    expect(updated).toMatchObject({ completedCount: 2, steamSyncedAt: '2026-09-27T10:01:00.000Z' })

    // Nothing new: nothing changes.
    const again = await client.post<SteamSyncResult>(`/api/v1/lists/${game.id}/steam-sync`)
    expect(again.body).toEqual({ unlocked: 0, added: 0 })
  })

  it('adds achievements the game gained, but not goals someone deleted', async () => {
    const { client, game } = await importedGame()
    const radiance = (await goals(client, game.id)).find((goal) => goal.title === 'Dream No More')!
    await client.delete(`/api/v1/tasks/${radiance.id}`)
    steam.schemas.get(HOLLOW_KNIGHT)!.push({
      name: 'GODHOME',
      displayName: 'Embrace the Void',
      description: 'Defeat the Absolute Radiance',
    })

    const synced = await client.post<SteamSyncResult>(`/api/v1/lists/${game.id}/steam-sync`)
    expect(synced.body).toEqual({ unlocked: 0, added: 1 })
    const titles = (await goals(client, game.id))
      .sort((a, b) => (a.position < b.position ? -1 : 1))
      .map((goal) => goal.title)
    expect(titles).toEqual(['Falsehood', 'Protected', 'Embrace the Void'])

    // Even once the deleted goal is gone for good (a month later, so sign in again).
    context.clock.advance(31 * 24 * 60 * 60 * 1000)
    context.services.cleanup.run()
    const later = await signedIn('anna').then((again) =>
      again.post<SteamSyncResult>(`/api/v1/lists/${game.id}/steam-sync`),
    )
    expect(later.body).toEqual({ unlocked: 0, added: 0 })
  })

  it('follows the owner of the game and needs edit access', async () => {
    const { client: anna, game } = await importedGame()
    const { client: ben, me: benMe } = await registerUser(context, 'ben')
    await anna.post(`/api/v1/lists/${game.id}/members`, { userId: benMe.id, role: 'viewer' })
    const byViewer = await ben.post(`/api/v1/lists/${game.id}/steam-sync`)
    expect(byViewer.status).toBe(403)

    await anna.patch(`/api/v1/lists/${game.id}/members/${benMe.id}`, { role: 'editor' })
    steam.unlocked.get(ANNA)!.get(HOLLOW_KNIGHT)!.RADIANCE = 1_790_900_000
    // Ben has no Steam account; the game follows Anna's.
    const byEditor = await ben.post<SteamSyncResult>(`/api/v1/lists/${game.id}/steam-sync`)
    expect(byEditor.body).toEqual({ unlocked: 1, added: 0 })

    await anna.delete('/api/v1/steam/profile')
    const unlinked = await ben.post(`/api/v1/lists/${game.id}/steam-sync`)
    expect(errorCode(unlinked)).toBe('steam_not_linked')
  })

  it('only works for games from Steam', async () => {
    const { client } = await importedGame()
    const own = (await client.post<List>('/api/v1/lists', { name: 'Tetris' })).body
    const response = await client.post(`/api/v1/lists/${own.id}/steam-sync`)
    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('steam_game_not_found')
  })

  it('happens by itself for games not synced for a while', async () => {
    const { client, game } = await importedGame()
    steam.unlocked.get(ANNA)!.get(HOLLOW_KNIGHT)!.HORNET_1 = 1_790_500_000

    context.clock.advance(5 * 60 * 60 * 1000)
    expect(await context.services.steam.syncDue()).toBe(0)
    context.clock.advance(2 * 60 * 60 * 1000)
    expect(await context.services.steam.syncDue()).toBe(1)
    const hornet = (await goals(client, game.id)).find((goal) => goal.title === 'Protected')
    expect(hornet?.completedAt).not.toBeNull()
    expect(await context.services.steam.syncDue()).toBe(0)
  })

  it('does not happen by itself when turned off', async () => {
    setup({ STEAM_SYNC_HOURS: '0' })
    const { client } = await linkedUser()
    await importGame(client)
    context.clock.advance(30 * 24 * 60 * 60 * 1000)
    expect(await context.services.steam.syncDue()).toBe(0)
  })
})

describe('parseProfileReference', () => {
  it('understands what people paste', () => {
    expect(parseProfileReference(' 76561198000000001 ')).toEqual({ kind: 'id', value: ANNA })
    expect(parseProfileReference('https://steamcommunity.com/profiles/76561198000000001/')).toEqual(
      { kind: 'id', value: ANNA },
    )
    expect(parseProfileReference('http://steamcommunity.com/id/anna_plays')).toEqual({
      kind: 'vanity',
      value: 'anna_plays',
    })
    expect(parseProfileReference('anna-plays')).toEqual({ kind: 'vanity', value: 'anna-plays' })
  })

  it('refuses everything else', () => {
    for (const input of [
      'https://steamcommunity.com.evil.example/id/anna',
      'https://steamcommunity.com/groups/anna',
      'https://steamcommunity.com/profiles/123',
      'anna plays',
      'a',
    ]) {
      expect(parseProfileReference(input), input).toBeNull()
    }
  })
})
