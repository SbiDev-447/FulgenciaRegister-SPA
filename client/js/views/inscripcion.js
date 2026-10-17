// Nueva inscripción: the four-step enrolment form as a page of its own.
//
// It used to be a modal, which forced a form this long into a 760px panel with
// its own scroll (S22). As a route it gets the full width, the browser's back
// button and a URL — and because that URL can be opened, reloaded or reached
// with the back button, the view loads the academic options it needs instead of
// leaning on Estudiantes having loaded them first.

import { api } from '../api.js'
import { h, clear } from '../ui/dom.js'
import { errorCopy } from '../ui/messages.js'
import { renderInscripcionWizard } from '../features/inscripcion.js'

/** Where the wizard belongs: leaving it returns to the list it started from. */
export const ESTUDIANTES_PATH = '/estudiantes'

/**
 * Render the inscription page into `container`.
 * @param {HTMLElement} container
 * @param {{ user?: object }} [options]
 */
export async function renderInscripcion(container, _options = {}) {
  const status = h('div', { class: 'alert alert--error', role: 'alert', hidden: true })
  const mount = h('div', { class: 'inscripcion-view__mount' })

  clear(container)
  container.append(
    h('section', { class: 'inscripcion-view' }, [
      h('div', { class: 'inscripcion-view__hero' }, [
        h('h2', { text: 'Nueva inscripción' }),
        h('p', {
          text: 'Cuatro pasos: datos del estudiante, inscripción, representantes y documentos.',
        }),
      ]),
      status,
      mount,
    ]),
  )

  let opciones = null
  try {
    opciones = await api.opciones()
  } catch (error) {
    // Without the academic options the wizard cannot fill its year and section
    // selects, so it is not painted at all: a half-formed form is worse than one
    // clear message.
    status.textContent = errorCopy(error, 'No se pudieron cargar las opciones académicas.')
    status.hidden = false
    return
  }

  renderInscripcionWizard(mount, {
    opciones,
    onExit: () => {
      window.location.hash = ESTUDIANTES_PATH
    },
  })
}
