import { useMediaQuery, WIDE_QUERY } from '../../lib/use-media-query'

/** On phones, settings pages lead back to the section list. */
export function useSettingsBack(): '/settings' | undefined {
  return useMediaQuery(WIDE_QUERY) ? undefined : '/settings'
}
