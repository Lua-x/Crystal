import type { List, SteamGame } from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Spinner } from '../../components/ui/spinner'
import { errorMessage } from '../../lib/errors'
import { steamGamesQuery, steamStatusQuery, useImportSteamGame } from './steam-data'

/** Case and accents do not matter when searching the library. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** Picks a game from the linked Steam library and imports it with its achievements. */
export function SteamLibrary({
  groupId,
  onOpen,
}: {
  groupId: string | null
  /** A game was imported, or an imported one was picked again. */
  onOpen: (listId: string) => void
}) {
  const { t } = useTranslation()
  const status = useQuery(steamStatusQuery)
  const linked = Boolean(status.data?.profile)
  const games = useQuery({ ...steamGamesQuery, enabled: linked })
  const importGame = useImportSteamGame()
  const [search, setSearch] = useState('')
  const deferred = useDeferredValue(search)

  if (status.isPending || (linked && games.isPending)) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="size-5" label={t('common.loading')} />
      </div>
    )
  }
  if (!linked) {
    return (
      <div className="flex flex-col items-start gap-3 py-2">
        <p className="text-callout text-text-secondary">{t('games.linkFirst')}</p>
        <Button asChild variant="primary">
          <Link to="/settings/steam">{t('games.linkSteam')}</Link>
        </Button>
      </div>
    )
  }
  if (games.isError) return <Alert>{errorMessage(games.error)}</Alert>

  const query = normalize(deferred.trim())
  const shown = (games.data ?? []).filter((game) => normalize(game.name).includes(query))
  const importing = importGame.isPending ? importGame.variables.appId : null

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('games.searchLibrary')}
          aria-label={t('games.searchLibrary')}
          className="pl-9"
        />
      </div>
      {importGame.isError && <Alert>{errorMessage(importGame.error)}</Alert>}
      {shown.length === 0 ? (
        <p className="py-6 text-center text-callout text-text-secondary">
          {t('games.libraryEmpty')}
        </p>
      ) : (
        <ul
          aria-label={t('games.library')}
          className="-mx-1 flex max-h-80 flex-col overflow-y-auto px-1"
        >
          {shown.map((game) => (
            <li
              key={game.appId}
              className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-fill-hover"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-callout">{game.name}</p>
                <p className="text-footnote text-text-secondary">
                  <Playtime game={game} />
                </p>
              </div>
              {game.listId ? (
                <Button
                  size="sm"
                  aria-label={t('games.openGame', { name: game.name })}
                  onClick={() => onOpen(game.listId!)}
                >
                  {t('games.open')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  aria-label={t('games.importGame', { name: game.name })}
                  loading={importing === game.appId}
                  disabled={importing !== null && importing !== game.appId}
                  onClick={() =>
                    importGame.mutate(
                      { appId: game.appId, groupId },
                      { onSuccess: (list: List) => onOpen(list.id) },
                    )
                  }
                >
                  {t('games.import')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {importing !== null && (
        <p role="status" className="text-footnote text-text-secondary">
          {t('games.importing')}
        </p>
      )}
    </div>
  )
}

function Playtime({ game }: { game: SteamGame }) {
  const { t } = useTranslation()
  if (game.playtimeMinutes === 0) return t('games.notPlayed')
  if (game.playtimeMinutes < 60) return t('games.playtimeShort')
  return t('games.playtime', { count: Math.floor(game.playtimeMinutes / 60) })
}
