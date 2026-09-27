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
import { LoginPage } from './features/auth/login-page'
import { InvitePage, RegisterPage, SetupPage } from './features/auth/register-pages'
import { ErrorScreen, NotFoundScreen, PendingScreen, RootLayout } from './features/root/root-layout'
import { AppShell } from './features/shell/app-shell'
import { HomePage } from './features/shell/home-page'
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
  component: LoginPage,
})

const setupRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/setup',
  beforeLoad: ({ context }) => {
    if (!context.authConfig.needsSetup) throw redirect({ to: '/login' })
  },
  component: SetupPage,
})

const registerRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/register',
  beforeLoad: ({ context }) => {
    if (context.authConfig.needsSetup) throw redirect({ to: '/setup' })
    if (context.authConfig.registration !== 'open') throw redirect({ to: '/login' })
  },
  component: RegisterPage,
})

const inviteRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/invite/$token',
  component: InvitePage,
})

// Settings are loaded on demand to keep the initial bundle small.

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
})

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: HomePage,
})

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
  authRoute.addChildren([loginRoute, setupRoute, registerRoute, inviteRoute]),
  appRoute.addChildren([
    homeRoute,
    settingsRoute.addChildren([
      settingsIndexRoute,
      accountSettingsRoute,
      appearanceSettingsRoute,
      sessionsSettingsRoute,
      usersSettingsRoute,
      invitesSettingsRoute,
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
