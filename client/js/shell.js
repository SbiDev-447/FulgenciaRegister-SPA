// Authenticated application shell: sidebar navigation, topbar with the view
// title and the theme toggle, and the content area views render into.

import { currentTheme, toggleTheme } from './features/theme.js'
import { escapeHtml } from './utils.js'

const ICONS = {
  inicio:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.6V21h14V9.6"/></svg>',
  estudiantes:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  documentos:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  menu:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  sun:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  logout:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
}

const NAV_ITEMS = [
  { path: '/', label: 'Inicio', icon: 'inicio' },
  { path: '/estudiantes', label: 'Estudiantes', icon: 'estudiantes' },
  { path: '/documentos', label: 'Documentos', icon: 'documentos' },
]

function navLinkMarkup(item, activePath) {
  const active = item.path === activePath ? ' is-active' : ''
  return `
    <a class="nav-link${active}" href="#${item.path}" data-path="${item.path}">
      ${ICONS[item.icon]}
      <span>${item.label}</span>
    </a>
  `
}

/**
 * Render the shell into `container`.
 * @param {HTMLElement} container
 * @param {{ user: object, onLogout: () => void|Promise<void> }} options
 */
export function mountShell(container, { user, onLogout }) {
  const initial = escapeHtml((user?.nombre || user?.usuario || '?').trim().charAt(0))
  const displayName = escapeHtml(user?.nombre ?? user?.usuario ?? '')
  const displayRole = escapeHtml(user?.rol ?? '')

  container.innerHTML = `
    <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar__brand">
          <img class="sidebar__shield" src="./assets/img/Shield-Liceo.webp" alt="" />
          <span class="sidebar__brand-text">
            <strong>Fulgencia</strong>
            <small>Register</small>
          </span>
        </div>

        <nav class="sidebar__nav" aria-label="Navegación principal">
          ${NAV_ITEMS.map((item) => navLinkMarkup(item, '/')).join('')}
        </nav>

        <div class="sidebar__footer">
          <div class="sidebar__user">
            <span class="sidebar__avatar">${initial}</span>
            <div class="sidebar__user-info">
              <span class="sidebar__user-name">${displayName}</span>
              <span class="sidebar__user-role">${displayRole}</span>
            </div>
          </div>
          <button class="btn btn--ghost btn--block" type="button" id="logout-button">
            ${ICONS.logout}
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <div class="shell__main">
        <header class="topbar">
          <button
            class="icon-btn sidebar-toggle"
            type="button"
            id="sidebar-toggle"
            aria-label="Abrir menú"
            aria-controls="sidebar"
            aria-expanded="false"
          >${ICONS.menu}</button>
          <h1 class="topbar__title" id="topbar-title">Inicio</h1>
          <div class="topbar__actions">
            <button class="icon-btn" type="button" id="theme-toggle"></button>
          </div>
        </header>

        <main class="content" id="view-root"></main>
      </div>
    </div>
  `

  const sidebar = container.querySelector('#sidebar')
  const backdrop = container.querySelector('#sidebar-backdrop')
  const sidebarToggle = container.querySelector('#sidebar-toggle')
  const themeToggle = container.querySelector('#theme-toggle')
  const title = container.querySelector('#topbar-title')
  const viewRoot = container.querySelector('#view-root')
  const navLinks = Array.from(container.querySelectorAll('.nav-link'))

  function setMenuOpen(open) {
    sidebar.classList.toggle('is-open', open)
    backdrop.classList.toggle('is-open', open)
    sidebarToggle.setAttribute('aria-expanded', String(open))
  }

  function paintThemeToggle() {
    const theme = currentTheme()
    const nextLabel = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
    themeToggle.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon
    themeToggle.setAttribute('aria-label', nextLabel)
    themeToggle.setAttribute('title', nextLabel)
  }

  sidebarToggle.addEventListener('click', () => setMenuOpen(!sidebar.classList.contains('is-open')))
  backdrop.addEventListener('click', () => setMenuOpen(false))
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setMenuOpen(false)
    }
  })

  themeToggle.addEventListener('click', () => {
    toggleTheme()
    paintThemeToggle()
  })

  navLinks.forEach((link) => {
    link.addEventListener('click', () => setMenuOpen(false))
  })

  container.querySelector('#logout-button').addEventListener('click', () => onLogout())

  paintThemeToggle()

  return {
    viewRoot,
    /** @param {string} path */
    setActive(path) {
      navLinks.forEach((link) => link.classList.toggle('is-active', link.dataset.path === path))
    },
    /** @param {string} text */
    setTitle(text) {
      title.textContent = text
      document.title = `${text} · Fulgencia Register`
    },
  }
}
