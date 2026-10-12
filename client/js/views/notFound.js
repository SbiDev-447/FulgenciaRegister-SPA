// 404 view for unknown hash routes inside the authenticated shell.

import { h, clear } from '../ui/dom.js'
import { icon } from '../ui/icons.js'

/**
 * @param {HTMLElement} container
 * @param {{ path?: string }} [context]
 */
export function renderNotFound(container, { path } = {}) {
  const view = h('section', { class: 'placeholder' }, [
    h('span', { class: 'placeholder__icon', 'aria-hidden': 'true' }, icon('compass')),
    h('h2', { text: 'Página no encontrada' }),
    h('p', {}, [
      'La ruta ',
      h('code', { text: path }),
      ' no existe. Usa el menú para volver a una sección válida.',
    ]),
    h('a', { class: 'tag', href: '#/', text: 'Volver al inicio' }),
  ])

  clear(container)
  container.append(view)
}