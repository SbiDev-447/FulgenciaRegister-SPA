// Minimal accessible modal: a fixed overlay with a dialog panel. Shared by
// views that need a focused one-at-a-time surface (student ficha, inscription
// form). Callers pass already-built nodes; nothing is rendered from strings
// with data (AGENTS/docs/ARQUITECTURA.md §6).

import { h } from './dom.js'
import { icon } from './icons.js'

/**
 * Open a modal dialog and return its close handle.
 * @param {{
 *   title: string,
 *   content: Node,
 *   footer?: Node[],
 *   onClose?: () => void,
 * }} options
 * @returns {{ close: () => void, element: HTMLElement }}
 */
export function openModal({ title, content, footer = [], onClose = () => {} }) {
  const closeButton = h('button', {
    class: 'icon-btn modal__close',
    type: 'button',
    'aria-label': 'Cerrar',
  }, icon('x'))

  const panel = h('div', {
    class: 'modal__panel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title,
  }, [
    h('header', { class: 'modal__header' }, [
      h('h2', { class: 'modal__title', text: title }),
      closeButton,
    ]),
    h('div', { class: 'modal__body' }, [content]),
    footer.length > 0 ? h('footer', { class: 'modal__footer' }, footer) : null,
  ])

  const overlay = h('div', { class: 'modal' }, [panel])
  document.body.append(overlay)
  document.body.classList.add('modal-open')

  function close() {
    document.body.classList.remove('modal-open')
    document.removeEventListener('keydown', onKey)
    overlay.remove()
    onClose()
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      close()
    }
  }

  closeButton.addEventListener('click', close)
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close()
    }
  })
  document.addEventListener('keydown', onKey)

  // Land keyboard focus inside the dialog.
  closeButton.focus()

  return { close, element: overlay }
}