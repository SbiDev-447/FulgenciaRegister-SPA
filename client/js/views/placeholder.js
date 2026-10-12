// Shared "not built yet" panel used by the placeholder views.

const TOOLS_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0 5 5L21 21l-3 3-9.7-9.7a4 4 0 0 1-5-5L6 6z"/></svg>'

/**
 * @param {HTMLElement} container
 * @param {{ title: string, message: string, tag?: string, icon?: string }} options
 */
export function renderPlaceholder(container, { title, message, tag = 'En construcción', icon = TOOLS_ICON }) {
  container.innerHTML = `
    <section class="placeholder">
      <span class="placeholder__icon" aria-hidden="true">${icon}</span>
      <h2>${title}</h2>
      <p>${message}</p>
      <span class="tag">${tag}</span>
    </section>
  `
}
