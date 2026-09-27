import type { Me } from '@crystal/shared'
import { useSuspenseQuery } from '@tanstack/react-query'

import { meQuery } from '../../lib/queries'

/**
 * The signed-in user inside the app shell. The route guard guarantees a session;
 * if it disappears meanwhile, the global 401 handler redirects to the login.
 */
export function useMe(): Me {
  const { data } = useSuspenseQuery(meQuery)
  if (!data) throw new Error('useMe() used outside of an authenticated route')
  return data
}
