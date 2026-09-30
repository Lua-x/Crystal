import './styles/index.css'

import {
  MutationCache,
  onlineManager,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { persistQueryClient } from '@tanstack/react-query-persist-client'
import { RouterProvider } from '@tanstack/react-router'
import i18next from 'i18next'
import { LazyMotion, MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { Toaster } from './components/ui/toast'
import { toast } from './components/ui/toast-store'
import { TooltipProvider } from './components/ui/tooltip'
import { refreshTaskData, registerTaskWriteDefaults } from './features/tasks/data'
import { ApiError } from './lib/api'
import { cachedLocale } from './lib/appearance'
import { detectLocale, initI18n } from './lib/i18n'
import { offlineCache } from './lib/offline-cache'
import { queryKeys } from './lib/queries'
import { registerServiceWorker } from './lib/service-worker'
import { createAppRouter } from './router'

const DAY_MS = 24 * 60 * 60 * 1000
/** How long the offline copy stays usable without being refreshed. */
const OFFLINE_MAX_AGE_MS = 7 * DAY_MS
/** Changing this discards offline copies written by older, incompatible versions. */
const OFFLINE_FORMAT = 'v1'
/** What is kept for offline use: the account and the lists and tasks, nothing else. */
const OFFLINE_KEYS = new Set([
  'me',
  'lists',
  'list-groups',
  'counts',
  'tasks',
  'task',
  'tags',
  'people',
])

const translations = initI18n(cachedLocale() ?? detectLocale())

/** Animation features are a separate download; until they arrive, nothing animates. */
const loadMotionFeatures = () => import('./lib/motion-features').then((module) => module.default)

registerServiceWorker(() =>
  toast({
    title: i18next.t('app.updated'),
    action: { label: i18next.t('app.reload'), onClick: () => window.location.reload() },
  }),
)

/** A 401 anywhere means the session ended (expired, revoked, signed out elsewhere). */
function handleUnauthorized(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401) return
  if (queryClient.getQueryData(queryKeys.me) === null) return
  // Nothing of the account may stay behind on this device, not even offline.
  queryClient.clear()
  void offlineCache.removeClient()
  queryClient.setQueryData(queryKeys.me, null)
  void router.navigate({ to: '/login', search: { redirect: router.state.location.href } })
}

// TanStack Query assumes it is online until told otherwise; after a reload
// without a connection, it must know right away so changes keep waiting.
onlineManager.setOnline(navigator.onLine)

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleUnauthorized }),
  mutationCache: new MutationCache({ onError: handleUnauthorized }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Kept as long as the offline copy, so restored data is not dropped right away.
      gcTime: OFFLINE_MAX_AGE_MS,
      // Client errors (4xx) will not fix themselves by retrying.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
        failureCount < 2,
    },
    mutations: {
      // A connection that just came back can drop the first requests; try a few times.
      retry: (failureCount, error) =>
        error instanceof ApiError && error.code === 'network' && failureCount < 3,
    },
  },
})
registerTaskWriteDefaults(queryClient)

const router = createAppRouter(queryClient)

/**
 * Restores the offline copy before anything renders, so the app can start
 * without a connection. Changes queued offline are sent once possible.
 */
async function restoreOfflineCopy() {
  const [, restored] = persistQueryClient({
    queryClient,
    persister: offlineCache,
    maxAge: OFFLINE_MAX_AGE_MS,
    buster: OFFLINE_FORMAT,
    dehydrateOptions: {
      shouldDehydrateQuery: ({ state, queryKey }) =>
        state.status === 'success' &&
        OFFLINE_KEYS.has(String(queryKey[0])) &&
        // The account itself, but not its sessions, tokens or calendar link.
        (queryKey[0] !== 'me' || queryKey.length === 1),
    },
  })
  try {
    await restored
  } catch {
    // No copy, or storage unavailable (private mode): start online as usual.
  }
  // The copy may be outdated: show it, but load the current state as soon as possible.
  void queryClient.invalidateQueries()
  void queryClient.resumePausedMutations().then(() => refreshTaskData(queryClient))
}

void Promise.allSettled([translations, restoreOfflineCopy()]).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <LazyMotion features={loadMotionFeatures} strict>
          <MotionConfig reducedMotion="user">
            <TooltipProvider delayDuration={600}>
              <RouterProvider router={router} />
              <Toaster />
            </TooltipProvider>
          </MotionConfig>
        </LazyMotion>
      </QueryClientProvider>
    </StrictMode>,
  )
})
