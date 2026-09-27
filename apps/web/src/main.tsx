import './styles/index.css'

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { Toaster } from './components/ui/toast'
import { TooltipProvider } from './components/ui/tooltip'
import { ApiError } from './lib/api'
import { cachedLocale } from './lib/appearance'
import { detectLocale, initI18n } from './lib/i18n'
import { queryKeys } from './lib/queries'
import { createAppRouter } from './router'

initI18n(cachedLocale() ?? detectLocale())

/** A 401 anywhere means the session ended (expired, revoked, signed out elsewhere). */
function handleUnauthorized(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401) return
  if (queryClient.getQueryData(queryKeys.me) === null) return
  queryClient.setQueryData(queryKeys.me, null)
  void router.navigate({ to: '/login', search: { redirect: router.state.location.href } })
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleUnauthorized }),
  mutationCache: new MutationCache({ onError: handleUnauthorized }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Client errors (4xx) will not fix themselves by retrying.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
        failureCount < 2,
    },
  },
})

const router = createAppRouter(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={600}>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
)
