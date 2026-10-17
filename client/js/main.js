// Application bootstrap: theme, session check, then the hash router. Decides
// between the public login screen and the authenticated shell on every change.

import { initTheme, getTheme, applyTheme } from './features/theme.js'
import { getUser, isAuthenticated, loadSession, logout } from './features/session.js'
import { createRouter } from './router.js'
import { mountShell } from './shell.js'
import { resolve } from './routes.js'
import { renderLogin } from './views/login.js'
import { renderNotFound } from './views/notFound.js'

const LOGIN_PATH = '/login'

const app = document.getElementById('app')

let shell = null
let router = null

async function handleLogout() {
  await logout()
  shell = null
  router.go(LOGIN_PATH, { replace: true })
}

function handleChange(match, path) {
  // Unauthenticated: the login screen is the only reachable route.
  if (!isAuthenticated()) {
    shell = null
    // The login screen stays light regardless of the persisted/OS theme;
    // the authenticated shell reapplies the saved theme below.
    applyTheme('light')
    if (path !== LOGIN_PATH) {
      router.go(LOGIN_PATH, { replace: true })
      return
    }
    renderLogin(app, { onSuccess: () => router.go('/', { replace: true }) })
    return
  }

  // Authenticated users do not need the login screen.
  if (path === LOGIN_PATH) {
    router.go('/', { replace: true })
    return
  }

  applyTheme(getTheme())
  if (!shell) {
    shell = mountShell(app, { user: getUser(), onLogout: handleLogout })
  }

  if (!match) {
    shell.setActive('')
    shell.setTitle('No encontrado')
    renderNotFound(shell.viewRoot, { path })
    return
  }

  // A route with no sidebar entry of its own (the inscription wizard) keeps its
  // parent item highlighted instead of leaving the sidebar blank.
  shell.setActive(match.activePath ?? path)
  shell.setTitle(match.title)
  match.view(shell.viewRoot, { user: getUser() })
}

async function boot() {
  initTheme()

  try {
    await loadSession()
  } catch (error) {
    console.error('No se pudo comprobar la sesión:', error)
  }

  router = createRouter({ resolve, onChange: handleChange })
  router.start()
}

boot()
