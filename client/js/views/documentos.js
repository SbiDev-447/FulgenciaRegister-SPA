// Documentos view: verify a student by cédula, choose one of the four letters
// and print it.
//
// Option A for the PDF: the letter is the school's own HTML skeleton
// (assets/skeletons), filled with the API summary and printed by the browser.
// Nothing is drawn on a canvas, so the letter stays text and selectable.
//
// `print` arrives as an option so a test observes the call without a printer.

import { h, clear } from '../ui/dom.js'
import { api } from '../api.js'
import { errorCopy } from '../ui/messages.js'
import { DOCUMENT_TYPES, letterValues, fillLetter, extractSheet } from '../letter.js'

/** Today as `YYYY-MM-DD` in the operator's own calendar, not UTC. */
function todayIso(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** Parse one sheet string into a node. Never innerHTML on the live document. */
function sheetNode(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return document.importNode(parsed.body.firstElementChild, true)
}

/**
 * @param {HTMLElement} container
 * @param {{ print?: () => void }} [options]
 */
export function renderDocumentos(container, { print } = {}) {
  const doPrint = print ?? (() => window.print())

  const cedulaInput = h('input', {
    class: 'input documentos__cedula',
    type: 'search',
    placeholder: 'Cédula, ej. V-12345678',
    'aria-label': 'Cédula del estudiante',
    required: true,
  })
  const results = h('div', { class: 'documentos__results' })
  const printArea = h('div', { class: 'documentos__print', 'aria-hidden': 'true' })

  const form = h(
    'form',
    {
      class: 'documentos__form',
      on: {
        submit: (event) => {
          event.preventDefault()
          load(cedulaInput.value)
        },
      },
    },
    [
      cedulaInput,
      h('button', { class: 'btn btn--primary', type: 'submit' }, [h('span', { text: 'Buscar' })]),
    ],
  )

  clear(container)
  container.append(
    h('section', { class: 'documentos' }, [
      h('div', { class: 'documentos__hero' }, [
        h('h2', { text: 'Documentos' }),
        h('p', {
          text: 'Verificá al estudiante por su cédula y emití cualquiera de los cuatro documentos. Se abren en la vista de impresión del navegador.',
        }),
      ]),
      form,
      results,
    ]),
    printArea,
  )

  /** The student the document buttons act on; replaced by every search. */
  let estudiante = null
  // Incremented per search so a slow earlier response never paints over a newer one.
  let seq = 0

  function load(raw) {
    const id = ++seq
    estudiante = null
    const cedula = String(raw ?? '').trim()
    if (!cedula) {
      results.replaceChildren(h('p', { class: 'documentos__status', text: 'Escribí una cédula.' }))
      return
    }
    results.replaceChildren(h('p', { class: 'documentos__status', text: 'Verificando cédula…' }))
    api
      .verificarDocumento(cedula)
      .then((data) => {
        if (id !== seq) return
        estudiante = data.estudiante
        renderStudent(data.estudiante)
      })
      .catch((error) => {
        if (id === seq) renderError(error)
      })
  }

  function renderError(error) {
    results.replaceChildren(
      h('div', { class: 'documentos__error' }, [
        h('p', { text: errorCopy(error, 'No se pudo verificar la cédula.') }),
      ]),
    )
  }

  function renderStudent(student) {
    const missing = []
    if (!student.anio) missing.push('la inscripción')
    if (!student.representante) missing.push('el representante')

    const buttons = Object.entries(DOCUMENT_TYPES).map(([tipo, letter]) =>
      h(
        'button',
        {
          class: 'btn btn--ghost btn--block documentos__emit',
          type: 'button',
          dataset: { tipo },
          on: { click: () => emitAndPrint(tipo) },
        },
        [h('span', { text: letter.label })],
      ),
    )

    results.replaceChildren(
      h('article', { class: 'card documentos__student' }, [
        h('div', { class: 'documentos__student-head' }, [
          h('h3', { text: student.nombre_completo }),
          h('p', { class: 'documentos__student-ci', text: `${student.tipo_ci}-${student.numero_ci}` }),
        ]),
        h('dl', { class: 'documentos__facts' }, [
          h('dt', { text: 'Año' }),
          h('dd', { text: `${student.anio ?? '—'}${student.seccion ? ` "${student.seccion}"` : ''}` }),
          h('dt', { text: 'Año escolar' }),
          h('dd', { text: student.anio_escolar ?? '—' }),
          h('dt', { text: 'Representante' }),
          h('dd', { text: student.representante?.nombre_completo ?? '—' }),
        ]),
        missing.length
          ? h('p', {
              class: 'documentos__warning',
              text: `Falta ${missing.join(' y ')}: algunos documentos van a salir incompletos.`,
            })
          : null,
        h('div', { class: 'documentos__group' }, [
          h('h4', { class: 'documentos__group-title', text: 'Documentos disponibles' }),
          h('div', { class: 'documentos__actions' }, buttons),
        ]),
        h('p', { class: 'documentos__status', dataset: { role: 'emit-status' }, hidden: true }),
      ]),
    )
  }

  async function emitAndPrint(tipo) {
    const student = estudiante
    if (!student) return

    const status = results.querySelector('[data-role="emit-status"]')
    const buttons = [...results.querySelectorAll('.documentos__emit')]
    buttons.forEach((button) => {
      button.disabled = true
    })
    if (status) {
      status.hidden = false
      status.textContent = 'Emitiendo…'
    }

    try {
      const { estudiante: fresh } = await api.emitirDocumento({ tipo, estudiante_id: student.id })
      const response = await fetch(`./assets/skeletons/${DOCUMENT_TYPES[tipo].file}`)
      if (!response.ok) throw new Error('No se pudo cargar el formato.')
      const template = await response.text()
      const filled = fillLetter(
        extractSheet(template),
        letterValues({ estudiante: fresh ?? student, fecha: todayIso() }),
      )
      if (!filled) throw new Error('El formato está vacío.')
      printArea.replaceChildren(sheetNode(filled))
      // A cold cache decodes the letterhead images asynchronously; printing
      // before that paints their alt text instead of the logos.
      const images = [...printArea.querySelectorAll('img')]
      await Promise.all(
        images.map((image) => (image.decode ? image.decode().catch(() => {}) : Promise.resolve())),
      )
      if (status) status.textContent = ''
      doPrint()
    } catch (error) {
      if (status) status.textContent = errorCopy(error, 'No se pudo emitir el documento.')
    } finally {
      buttons.forEach((button) => {
        button.disabled = false
      })
    }
  }
}
