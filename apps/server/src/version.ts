// Replaced with the release version by the production build (see scripts/build.mjs).
declare const __CRYSTAL_VERSION__: string | undefined

export const APP_VERSION = typeof __CRYSTAL_VERSION__ === 'string' ? __CRYSTAL_VERSION__ : 'dev'
