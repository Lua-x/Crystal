// A stand-in for the Steam Web API, store and CDN for the end-to-end tests.
// `POST /__unlock?name=…` unlocks an achievement, as if the player had just earned it.
import { createServer } from 'node:http'
import { deflateSync } from 'node:zlib'

const PORT = Number(process.env.PORT ?? 4175)
const ORIGIN = `http://127.0.0.1:${PORT}`
const KEY = 'e2e-steam-key'
const PLAYER = '76561198000000042'
const HOLLOW_KNIGHT = 367520

const games = [
  { appid: 413150, name: 'Stardew Valley', playtime_forever: 0 },
  { appid: HOLLOW_KNIGHT, name: 'Hollow Knight', playtime_forever: 4200 },
  { appid: 504230, name: 'Celeste', playtime_forever: 720 },
]
const achievements = [
  {
    name: 'FALSE_KNIGHT',
    displayName: 'Falsehood',
    description: 'Defeat the False Knight',
    color: [196, 64, 48],
  },
  {
    name: 'HORNET_1',
    displayName: 'Protected',
    description: 'Defeat Hornet in Greenpath',
    color: [40, 120, 200],
  },
  { name: 'RADIANCE', displayName: 'Dream No More', hidden: true, color: [230, 200, 60] },
]
const percentages = { FALSE_KNIGHT: '71.4', HORNET_1: 55.2, RADIANCE: 6.8 }
const unlocked = new Map([['FALSE_KNIGHT', 1_790_000_000]])

/** A solid-color PNG, so the browser has a real picture to show. */
function png(width, height, [red, green, blue]) {
  const table = Array.from({ length: 256 }, (_, index) => {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    return value >>> 0
  })
  const crc = (bytes) => {
    let value = 0xffffffff
    for (const byte of bytes) value = table[(value ^ byte) & 0xff] ^ (value >>> 8)
    return (value ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const check = Buffer.alloc(4)
    check.writeUInt32BE(crc(body))
    return Buffer.concat([length, body, check])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array(width).fill([red, green, blue]).flat()),
  ])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array(height).fill(row)))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const pictures = new Map([
  [`/header/${HOLLOW_KNIGHT}.png`, png(46, 21, [30, 40, 80])],
  ...achievements.map((achievement) => [
    `/icons/${achievement.name}.png`,
    png(8, 8, achievement.color),
  ]),
])

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', ORIGIN)
  const query = url.searchParams
  const needsKey = url.pathname.startsWith('/I') && !url.pathname.includes('GlobalAchievement')
  if (needsKey && query.get('key') !== KEY) {
    response.writeHead(403, { 'content-type': 'text/html' })
    response.end('<html>Forbidden</html>')
    return
  }
  switch (url.pathname) {
    case '/health':
      return send(response, 200, { ok: true })
    case '/__unlock':
      unlocked.set(query.get('name'), Math.floor(Date.now() / 1000))
      return send(response, 200, { ok: true })
    case '/ISteamUser/ResolveVanityURL/v1/':
      return send(response, 200, {
        response:
          query.get('vanityurl') === 'e2eplayer'
            ? { steamid: PLAYER, success: 1 }
            : { success: 42 },
      })
    case '/ISteamUser/GetPlayerSummaries/v2/':
      return send(response, 200, {
        response: {
          players:
            query.get('steamids') === PLAYER
              ? [{ steamid: PLAYER, personaname: 'E2E Player' }]
              : [],
        },
      })
    case '/IPlayerService/GetOwnedGames/v1/':
      return send(response, 200, { response: { game_count: games.length, games } })
    case '/ISteamUserStats/GetSchemaForGame/v2/':
      if (Number(query.get('appid')) !== HOLLOW_KNIGHT) return send(response, 400, {})
      return send(response, 200, {
        game: {
          availableGameStats: {
            achievements: achievements.map((achievement) => ({
              name: achievement.name,
              displayName: achievement.displayName,
              hidden: achievement.hidden ? 1 : 0,
              ...(achievement.description ? { description: achievement.description } : {}),
              icon: `${ORIGIN}/icons/${achievement.name}.png`,
            })),
          },
        },
      })
    case '/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/':
      return send(response, 200, {
        achievementpercentages: {
          achievements: Object.entries(percentages).map(([name, percent]) => ({ name, percent })),
        },
      })
    case '/ISteamUserStats/GetPlayerAchievements/v1/':
      return send(response, 200, {
        playerstats: {
          steamID: PLAYER,
          success: true,
          achievements: achievements.map((achievement) => ({
            apiname: achievement.name,
            achieved: unlocked.has(achievement.name) ? 1 : 0,
            unlocktime: unlocked.get(achievement.name) ?? 0,
          })),
        },
      })
    case '/api/appdetails': {
      const appId = query.get('appids')
      const game = games.find((item) => String(item.appid) === appId)
      return send(response, 200, {
        [appId]: game
          ? {
              success: true,
              data: { name: game.name, header_image: `${ORIGIN}/header/${appId}.png` },
            }
          : { success: false },
      })
    }
    default: {
      const picture = pictures.get(url.pathname)
      if (!picture) return send(response, 404, {})
      response.writeHead(200, { 'content-type': 'image/png' })
      response.end(picture)
    }
  }
}).listen(PORT, '127.0.0.1')
