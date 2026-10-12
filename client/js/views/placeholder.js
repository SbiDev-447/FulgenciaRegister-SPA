// Shared "not built yet" panel used by the placeholder views.

import { h, clear } from '../ui/dom.js'
import { icon } from '../ui/icons.js'

/**
 * @param {HTMLElement} container
 * @param {{ title: string, message: string, tag?: string, iconName?: string }} options
 */
export function renderPlaceholder(container, { title, message, tag = 'En construcción', iconName = 'tools' }) {
  const view = h('section', { class: 'placeholder' }, [
    h('span', { class: 'placeholder__icon', 'aria-hidden': 'true' }, icon(iconName)),
    h('h2', { text: title }),
    h('p', { text: message }),
    h('span', { class: 'tag', text: tag }),
  ])

  clear(container)
  container.append(view)
}