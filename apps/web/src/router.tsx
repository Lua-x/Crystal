import { SMART_VIEWS } from '@crystal/shared'
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router'
import { z } from 'zod'

import { AuthLayout } from './features/auth/auth-layout'
import { ErrorScreen, NotFoundScreen, PendingScreen, RootLayout } from './features/root/root-layout'
import { AppShell } from './features/shell/app-shell'
import { ListPage } from './features/tasks/list-page'
import { SearchPage } from './features/tasks/search'
import { SmartViewPage } from './features/tasks/smart-view-page'
import { TagPage } from './features/tasks/tag-page'
import { authConfigQuery, meQuery } from './lib/queries'

interface RouterContext {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundScreen,
  errorComponent: ErrorScreen,
})

/* ── Signed-out area ───────────────────────────────────────── */

// The pages below are loaded on demand: people who are signed in never need them.

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_auth',
  component: AuthLayout,
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me) throw redirect({ to: '/' })
    return { authConfig: await context.queryClient.ensureQueryData(authConfigQuery) }
  },
})

const loginRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/login',
  validateSearch: z.object({
    redirect: z.string().optional(),
    error: z.string().optional(),
  }),
  beforeLoad: ({ context }) => {
    if (context.authConfig.needsSetup) throw redirect({ to: '/setup' })
  },
  component: lazyRouteComponent(() => import('./features/auth/login-page'), 'LoginPage'),
})

const setupRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/setup',
  beforeLoad: ({ context }) => {
    if (!context.authConfig.needsSetup) throw redirect({ to: '/login' })
  },
  component: lazyRouteComponent(() => import('./features/auth/register-pages'), 'SetupPage'),
})

const registerRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/register',
  beforeLoad: ({ context }) => {
    if (context.authConfig.needsSetup) throw redirect({ to: '/setup' })
    if (context.authConfig.registration !== 'open') throw redirect({ to: '/login' })
  },
  component: lazyRouteComponent(() => import('./features/auth/register-pages'), 'RegisterPage'),
})

const inviteRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/invite/$token',
  component: lazyRouteComponent(() => import('./features/auth/register-pages'), 'InvitePage'),
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/forgot-password',
  beforeLoad: ({ context }) => {
    if (!context.authConfig.passwordReset) throw redirect({ to: '/login' })
  },
  component: lazyRouteComponent(
    () => import('./features/auth/password-reset-pages'),
    'ForgotPasswordPage',
  ),
})

const resetPasswordRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/reset-password',
  validateSearch: z.object({ token: z.string().optional() }),
  component: lazyRouteComponent(
    () => import('./features/auth/password-reset-pages'),
    'ResetPasswordPage',
  ),
})

/* ── Signed-in area ────────────────────────────────────────── */

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  component: AppShell,
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) {
      throw redirect({
        to: '/login',
        search: location.href === '/' ? {} : { redirect: location.href },
      })
    }
    return { me }
  },
  // The open task (details panel) is part of every page's URL.
  validateSearch: z.object({ task: z.string().optional() }),
})

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/my-day', replace: true })
  },
})

const smartViewRoutes = SMART_VIEWS.map((view) =>
  createRoute({
    getParentRoute: () => appRoute,
    path: `/${view}`,
    component: () => <SmartViewPage view={view} />,
  }),
)

const listRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/lists/$listId',
  component: ListPage,
})

const tagRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/tags/$tag',
  component: TagPage,
})

const statsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/stats',
  component: lazyRouteComponent(() => import('./features/stats/stats-page'), 'StatsPage'),
})

const searchRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/search',
  validateSearch: z.object({ q: z.string().optional() }),
  component: SearchPage,
})

// Settings are loaded on demand to keep the initial bundle small.

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: lazyRouteComponent(
    () => import('./features/settings/settings-layout'),
    'SettingsLayout',
  ),
})

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/',
  component: lazyRouteComponent(
    () => import('./features/settings/settings-layout'),
    'SettingsIndexPage',
  ),
})

const accountSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/account',
  validateSearch: z.object({
    sso: z.string().optional(),
    error: z.string().optional(),
  }),
  component: lazyRouteComponent(
    () => import('./features/settings/account-settings'),
    'AccountSettingsPage',
  ),
})

const appearanceSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/appearance',
  component: lazyRouteComponent(
    () => import('./features/settings/appearance-settings'),
    'AppearanceSettingsPage',
  ),
})

const notificationsSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/notifications',
  component: lazyRouteComponent(
    () => import('./features/settings/notifications-settings'),
    'NotificationsSettingsPage',
  ),
})

const apiSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/api',
  component: lazyRouteComponent(
    () => import('./features/settings/api-settings'),
    'ApiSettingsPage',
  ),
})

const transferSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/transfer',
  component: lazyRouteComponent(
    () => import('./features/settings/transfer-settings'),
    'TransferSettingsPage',
  ),
})

const calendarSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/calendar',
  component: lazyRouteComponent(
    () => import('./features/settings/calendar-settings'),
    'CalendarSettingsPage',
  ),
})

const sessionsSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/sessions',
  component: lazyRouteComponent(
    () => import('./features/settings/sessions-settings'),
    'SessionsSettingsPage',
  ),
})

const requireAdmin = ({ context }: { context: { me: { role: string } } }) => {
  if (context.me.role !== 'admin') throw redirect({ to: '/settings' })
}

const usersSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/users',
  beforeLoad: requireAdmin,
  component: lazyRouteComponent(
    () => import('./features/settings/users-settings'),
    'UsersSettingsPage',
  ),
})

const invitesSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/invites',
  beforeLoad: requireAdmin,
  component: lazyRouteComponent(
    () => import('./features/settings/invites-settings'),
    'InvitesSettingsPage',
  ),
})

const backupsSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/backups',
  beforeLoad: requireAdmin,
  component: lazyRouteComponent(
    () => import('./features/settings/backups-settings'),
    'BackupsSettingsPage',
  ),
})

/* ── Development only ──────────────────────────────────────── */

// Removed from production builds: `import.meta.env.DEV` is replaced with `false`.
const devRoutes = import.meta.env.DEV
  ? [
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/dev/design',
        component: lazyRouteComponent(() => import('./features/dev/design-page'), 'DesignPage'),
      }),
    ]
  : []

const routeTree = rootRoute.addChildren([
  authRoute.addChildren([
    loginRoute,
    setupRoute,
    registerRoute,
    inviteRoute,
    forgotPasswordRoute,
    resetPasswordRoute,
  ]),
  appRoute.addChildren([
    homeRoute,
    ...smartViewRoutes,
    listRoute,
    tagRoute,
    searchRoute,
    statsRoute,
    settingsRoute.addChildren([
      settingsIndexRoute,
      accountSettingsRoute,
      appearanceSettingsRoute,
      notificationsSettingsRoute,
      sessionsSettingsRoute,
      calendarSettingsRoute,
      transferSettingsRoute,
      apiSettingsRoute,
      usersSettingsRoute,
      invitesSettingsRoute,
      backupsSettingsRoute,
    ]),
  ]),
  ...devRoutes,
])

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPendingComponent: PendingScreen,
    defaultPendingMs: 300,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
