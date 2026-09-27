// Runs before the app bundle: applies the cached theme, accent color and language
// so the first paint already matches the user's settings. Kept dependency-free
// because it must be a separate file (the CSP forbids inline scripts).
;(function () {
  try {
    var raw = window.localStorage.getItem('crystal.appearance')
    if (!raw) return
    var appearance = JSON.parse(raw)
    var root = document.documentElement
    if (appearance.theme === 'light' || appearance.theme === 'dark') {
      root.setAttribute('data-theme', appearance.theme)
    }
    var accent = appearance.accent || {}
    var valuePattern = /^light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/i
    for (var name in accent) {
      if (/^--color-[a-z-]+$/.test(name) && valuePattern.test(accent[name])) {
        root.style.setProperty(name, accent[name])
      }
    }
    if (appearance.locale === 'de' || appearance.locale === 'en') {
      root.setAttribute('lang', appearance.locale)
    }
  } catch {
    // Private mode or corrupted storage: fall back to the system defaults.
  }
})()
