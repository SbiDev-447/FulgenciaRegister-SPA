// Application bootstrap: theme, session check, then the hash router. Decides
// between the public login screen and the authenticated shell on every change.

import { initTheme } from './features/theme.js'
import { getUser, isAuthenticated, loadSession, logout } from './features/session.js'
import { createRouter } from './router.js'
import { mountShell } from './shell.js'
import { renderLogin } from './views/login.js'
import { renderInicio } from './views/inicio.js'
import { renderEstudiantes } from './views/estudiantes.js'
import { renderDocumentos } from './views/documentos.js'
import { renderNotFound } from './views/notFound.js'

const LOGIN_PATH = '/login'

const ROUTES = [
  { path: '/', title: 'Inicio', view: renderInicio },
  { path: '/estudiantes', title: 'Estudiantes', view: renderEstudiantes },
  { path: '/documentos', title: 'Documentos', view: renderDocumentos },
]

const app = document.getElementById('app')

let shell = null
let router = null

function resolve(path) {
  return ROUTES.find((route) => route.path === path) ?? null
}

async function handleLogout() {
  await logout()
  shell = null
  router.go(LOGIN_PATH, { replace: true })
}

function handleChange(match, path) {
  // Unauthenticated: the login screen is the only reachable route.
  if (!isAuthenticated()) {
    shell = null
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

  if (!shell) {
    shell = mountShell(app, { user: getUser(), onLogout: handleLogout })
  }

  if (!match) {
    shell.setActive('')
    shell.setTitle('No encontrado')
    renderNotFound(shell.viewRoot, { path })
    return
  }

  shell.setActive(path)
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
