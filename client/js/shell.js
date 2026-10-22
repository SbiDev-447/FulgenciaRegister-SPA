// Authenticated application shell: sidebar navigation, topbar with the view
// title and the theme toggle, and the content area views render into.

import { currentTheme, toggleTheme } from './features/theme.js'
import { h, clear } from './ui/dom.js'
import { icon } from './ui/icons.js'

const NAV_ITEMS = [
  { path: '/', label: 'Inicio', iconName: 'inicio' },
  { path: '/estudiantes', label: 'Estudiantes', iconName: 'estudiantes' },
  // Right below the roster: the enrolment flow starts by scanning it.
  { path: '/inscripcion', label: 'Nueva inscripción', iconName: 'plus' },
  { path: '/documentos', label: 'Documentos', iconName: 'documentos' },
]

function navLink(item, activePath) {
  const active = item.path === activePath
  return h(
    'a',
    {
      class: active ? 'nav-link is-active' : 'nav-link',
      href: `#${item.path}`,
      dataset: { path: item.path },
    },
    [icon(item.iconName), h('span', { text: item.label })],
  )
}

/**
 * Render the shell into `container`.
 * @param {HTMLElement} container
 * @param {{ user: object, onLogout: () => void|Promise<void> }} options
 */
export function mountShell(container, { user, onLogout }) {
  const initial = (user?.nombre || user?.usuario || '?').trim().charAt(0).toUpperCase()
  const displayName = user?.nombre ?? user?.usuario ?? ''
  const displayRole = user?.rol ?? ''

  const sidebarToggle = h('button', {
    class: 'icon-btn sidebar-toggle',
    type: 'button',
    id: 'sidebar-toggle',
    'aria-label': 'Abrir menú',
    'aria-controls': 'sidebar',
    'aria-expanded': 'false',
  }, icon('menu'))

  const themeToggle = h('button', {
    class: 'icon-btn',
    type: 'button',
    id: 'theme-toggle',
  })

  const viewRoot = h('main', { class: 'content', id: 'view-root' })

  const backdrop = h('div', { class: 'sidebar-backdrop', id: 'sidebar-backdrop' })

  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar' }, [
    h('div', { class: 'sidebar__brand' }, [
      h('img', {
        class: 'sidebar__shield',
        src: './assets/img/Shield-Liceo.webp',
        alt: 'Escudo del liceo',
      }),
      h('span', { class: 'sidebar__brand-text' }, [
        h('strong', { text: 'Fulgencia' }),
        h('small', { text: 'Register' }),
      ]),
    ]),
    h('nav', { class: 'sidebar__nav', 'aria-label': 'Navegación principal' }, NAV_ITEMS.map((item) => navLink(item, '/'))),
    h('div', { class: 'sidebar__footer' }, [
      h('div', { class: 'sidebar__user' }, [
        h('span', { class: 'sidebar__avatar', text: initial }),
        h('div', { class: 'sidebar__user-info' }, [
          h('span', { class: 'sidebar__user-name', text: displayName }),
          h('span', { class: 'sidebar__user-role', text: displayRole }),
        ]),
      ]),
      h('button', { class: 'btn btn--ghost btn--block', type: 'button', id: 'logout-button' }, [
        icon('logout'),
        h('span', { text: 'Cerrar sesión' }),
      ]),
    ]),
  ])

  const shell = h('div', { class: 'shell' }, [
    sidebar,
    h('div', { class: 'shell__main' }, [
      h('header', { class: 'topbar' }, [
        sidebarToggle,
        h('h1', { class: 'topbar__title', id: 'topbar-title', text: 'Inicio' }),
        h('div', { class: 'topbar__actions' }, [themeToggle]),
      ]),
      viewRoot,
    ]),
  ])

  clear(container)
  container.append(backdrop, shell)

  const navLinks = Array.from(sidebar.querySelectorAll('.nav-link'))

  function setMenuOpen(open) {
    sidebar.classList.toggle('is-open', open)
    backdrop.classList.toggle('is-open', open)
    sidebarToggle.setAttribute('aria-expanded', String(open))
  }

  function paintThemeToggle() {
    const theme = currentTheme()
    const nextLabel = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
    themeToggle.replaceChildren(icon(theme === 'dark' ? 'sun' : 'moon'))
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

  const title = container.querySelector('#topbar-title')

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