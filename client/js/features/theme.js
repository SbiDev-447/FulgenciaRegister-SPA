// Light/dark theme handling. The choice is persisted in localStorage; when the
// user has never chosen, the operating-system preference is used.

const STORAGE_KEY = 'fulgencia-theme'
const THEMES = ['light', 'dark']

function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** @returns {'light'|'dark'} */
export function getTheme() {
  let stored = null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch {
    stored = null
  }
  if (THEMES.includes(stored)) {
    return stored
  }
  return prefersDark() ? 'dark' : 'light'
}

/** @param {'light'|'dark'} theme */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

/** Apply the effective theme on boot. @returns {'light'|'dark'} */
export function initTheme() {
  const theme = getTheme()
  applyTheme(theme)
  return theme
}

/** Flip and persist the theme. @returns {'light'|'dark'} the new theme */
export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* persistence is best-effort */
  }
  applyTheme(next)
  return next
}

/** @returns {'light'|'dark'} */
export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}
