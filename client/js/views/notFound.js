// 404 view for unknown hash routes inside the authenticated shell.

import { escapeHtml } from '../utils.js'

const COMPASS_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>'

/**
 * @param {HTMLElement} container
 * @param {{ path?: string }} [context]
 */
export function renderNotFound(container, { path } = {}) {
  container.innerHTML = `
    <section class="placeholder">
      <span class="placeholder__icon" aria-hidden="true">${COMPASS_ICON}</span>
      <h2>Página no encontrada</h2>
      <p>La ruta <code>${escapeHtml(path)}</code> no existe. Usa el menú para volver a una sección válida.</p>
      <a class="tag" href="#/">Volver al inicio</a>
    </section>
  `
}
