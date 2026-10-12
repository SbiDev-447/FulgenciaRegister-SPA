// Inicio view: welcome panel and quick-access cards. Placeholder for the future
// statistics dashboard.

import { h, clear } from '../ui/dom.js'

/**
 * @param {HTMLElement} container
 * @param {{ user?: object }} [context]
 */
export function renderInicio(container, { user } = {}) {
  const nombre = user?.nombre ?? user?.usuario ?? ''
  const bienvenida = nombre ? `Bienvenido, ${nombre}` : 'Bienvenido'

  const view = h('section', { class: 'inicio' }, [
    h('div', { class: 'inicio__hero' }, [
      h('h2', { text: bienvenida }),
      h('p', {
        text: 'Panel de gestión de la inscripción estudiantil del liceo. Desde aquí consultarás estudiantes, emitirás documentos y verás las estadísticas del período.',
      }),
    ]),
    h('div', { class: 'inicio__grid' }, [
      h('article', { class: 'card inicio__card' }, [
        h('h3', { text: 'Estudiantes' }),
        h('p', { text: 'Listado, búsqueda por nombre o cédula, ficha e inscripción.' }),
        h('a', { class: 'tag', href: '#/estudiantes', text: 'En construcción' }),
      ]),
      h('article', { class: 'card inicio__card' }, [
        h('h3', { text: 'Documentos' }),
        h('p', { text: 'Verificación por cédula y emisión de constancias imprimibles.' }),
        h('a', { class: 'tag', href: '#/documentos', text: 'En construcción' }),
      ]),
      h('article', { class: 'card inicio__card' }, [
        h('h3', { text: 'Estadísticas' }),
        h('p', { text: 'Total de estudiantes, distribución por sexo y por año.' }),
        h('span', { class: 'tag', text: 'En construcción' }),
      ]),
    ]),
  ])

  clear(container)
  container.append(view)
}