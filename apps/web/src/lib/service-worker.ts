/**
 * The service worker's URL. It changes with every build, so a new version of
 * Crystal installs a new worker, which caches the new app for offline use.
 */
export const SERVICE_WORKER_URL = `/sw.js?build=${encodeURIComponent(__CRYSTAL_BUILD__)}`

/**
 * Registers the service worker (production builds only: in development Vite
 * serves the app, and caching would get in the way). `onUpdate` runs when a
 * newer version took over while this page was open.
 */
export function registerServiceWorker(onUpdate: () => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const hadController = navigator.serviceWorker.controller !== null
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) onUpdate()
  })
  const register = () => {
    navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' }).catch(() => {
      // Without a service worker Crystal still works, just not offline.
    })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
