// Reportes view: print the attendance sheet of one section.
//
// A section is identified by grade + section, so both filters are required; the
// API resolves the most recent school year with students in that group and
// returns the whole roster unpaged (a printed sheet has no "next page" button).
//
// The preview on screen and the sheet sent to the printer are built from the
// same response. `print` arrives as an option so a test observes the call
// without a printer.

import { h, clear } from '../ui/dom.js'
import { icon } from '../ui/icons.js'
import { api } from '../api.js'
import { errorCopy } from '../ui/messages.js'
import { formatToday } from '../ui/format.js'
import { INSTITUTION } from '../institution.js'

/** "Pérez Gómez, María José" — the way the school writes a roster. */
function fullName(student) {
  const apellidos = [student.primer_apellido, student.segundo_apellido].filter(Boolean).join(' ')
  const nombres = [student.primer_nombre, student.segundo_nombre].filter(Boolean).join(' ')
  return `${apellidos}, ${nombres}`
}

function ciText(student) {
  return `${student.tipo_ci}-${student.numero_ci}`
}

function sexoLabel(value) {
  return value === 'F' ? 'Femenino' : value === 'M' ? 'Masculino' : '—'
}

function phoneText(student) {
  return student.telefono || '—'
}

function emailText(student) {
  return student.correo || '—'
}

function groupLabel(filtros) {
  const year = filtros.anio_escolar ? ` · Año escolar ${filtros.anio_escolar}` : ''
  return `${filtros.anio} — Sección "${filtros.seccion}"${year}`
}

/** The printable sheet: one <main> with the letterhead, the table and the foot. */
function buildSheet(data) {
  return h('main', { class: 'roster-sheet' }, [
    h('header', { class: 'roster-sheet__head' }, [
      h('img', { class: 'roster-sheet__logo', src: INSTITUTION.logo, alt: '' }),
      h('h1', { class: 'roster-sheet__school', text: INSTITUTION.school }),
      h('h2', { class: 'roster-sheet__title', text: 'Lista de estudiantes' }),
      h('p', { class: 'roster-sheet__meta', text: groupLabel(data.filtros) }),
    ]),
    h('table', { class: 'roster-sheet__table' }, [
      h('thead', {}, [
        h('tr', {}, [
          h('th', { scope: 'col', text: 'N°' }),
          h('th', { scope: 'col', text: 'Apellidos y nombres' }),
          h('th', { scope: 'col', text: 'Cédula' }),
          h('th', { scope: 'col', text: 'Sexo' }),
          h('th', { scope: 'col', text: 'Teléfono' }),
          h('th', { scope: 'col', text: 'Correo' }),
        ]),
      ]),
      h(
        'tbody',
        {},
        data.estudiantes.map((student, index) =>
          h('tr', {}, [
            h('td', { class: 'roster-sheet__num', text: String(index + 1) }),
            h('td', { text: fullName(student) }),
            h('td', { class: 'roster-sheet__ci', text: ciText(student) }),
            h('td', { class: 'roster-sheet__sexo', text: sexoLabel(student.sexo) }),
            h('td', { class: 'roster-sheet__phone', text: phoneText(student) }),
            h('td', { class: 'roster-sheet__email', text: emailText(student) }),
          ]),
        ),
      ),
    ]),
    h('footer', { class: 'roster-sheet__foot' }, [
      h('span', {
        class: 'roster-sheet__total',
        text: `${data.total} estudiante${data.total === 1 ? '' : 's'} en la sección`,
      }),
      h('span', { class: 'roster-sheet__printed', text: `Impreso el ${formatToday()}` }),
    ]),
  ])
}

/**
 * @param {HTMLElement} container
 * @param {{ print?: () => void }} [options]
 */
export function renderReportes(container, { print } = {}) {
  const doPrint = print ?? (() => window.print())

  const anioSelect = h('select', {
    class: 'reportes__select reportes__anio',
    'aria-label': 'Año',
    disabled: true,
  })
  const seccionSelect = h('select', {
    class: 'reportes__select reportes__seccion',
    'aria-label': 'Sección',
    disabled: true,
  })
  const submitBtn = h('button', { class: 'btn btn--primary', type: 'submit' }, [
    icon('search'),
    h('span', { text: 'Ver lista' }),
  ])
  const results = h('div', { class: 'reportes__results' })
  const printArea = h('div', { class: 'reportes__print', 'aria-hidden': 'true' })

  const form = h(
    'form',
    {
      class: 'reportes__form',
      on: {
        submit: (event) => {
          event.preventDefault()
          load()
        },
      },
    },
    [
      h('label', { class: 'reportes__field' }, [h('span', { text: 'Año' }), anioSelect]),
      h('label', { class: 'reportes__field' }, [h('span', { text: 'Sección' }), seccionSelect]),
      submitBtn,
    ],
  )

  const view = h('section', { class: 'reportes' }, [
    h('div', { class: 'reportes__hero' }, [
      h('h2', { text: 'Reportes' }),
      h('p', {
        text: 'Elegí un año y una sección para ver la lista completa de sus estudiantes y imprimirla.',
      }),
    ]),
    form,
    results,
  ])

  clear(container)
  container.append(view, printArea)

  let options = null
  /** The roster currently shown; what "Imprimir" prints. */
  let current = null
  // Incremented per request so a slow earlier response never paints over a newer one.
  let seq = 0

  function fillSections(sections, selected = '') {
    seccionSelect.replaceChildren(
      h('option', { value: '', text: 'Selecciona una sección' }),
      ...sections.map((section) => h('option', { value: section, text: section })),
    )
    seccionSelect.disabled = sections.length === 0
    seccionSelect.value = selected
  }

  function fillFilters(academic) {
    options = academic
    const years = options.years ?? []

    anioSelect.replaceChildren(
      h('option', { value: '', text: 'Selecciona un año' }),
      ...years.map((year) => h('option', { value: year.label, text: year.label })),
    )
    anioSelect.disabled = false
    anioSelect.value = ''
    fillSections([])
    results.replaceChildren()
    current = null
  }

  function renderFiltersError(error) {
    results.replaceChildren(
      h('div', { class: 'reportes__error' }, [
        h('p', { text: errorCopy(error, 'No se pudieron cargar los filtros.') }),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: loadFilters } }, [
          h('span', { text: 'Reintentar' }),
        ]),
      ]),
    )
  }

  function loadFilters() {
    api.opciones().then(fillFilters).catch(renderFiltersError)
  }

  function renderError(error) {
    results.replaceChildren(
      h('div', { class: 'reportes__error' }, [
        h('p', { text: errorCopy(error, 'No se pudo cargar la lista de la sección.') }),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: load } }, [
          h('span', { text: 'Reintentar' }),
        ]),
      ]),
    )
  }

  function renderEmpty(data) {
    results.replaceChildren(
      h('article', { class: 'card reportes__card' }, [
        h('div', { class: 'reportes__card-head' }, [
          h('div', { class: 'reportes__card-title' }, [
            h('span', { class: 'reportes__eyebrow', text: 'Vista previa' }),
            h('h3', { text: 'Lista de estudiantes' }),
            h('p', { class: 'reportes__meta', text: groupLabel(data.filtros) }),
          ]),
          h('span', { class: 'badge reportes__badge', text: '0 estudiantes' }),
        ]),
        h('div', { class: 'reportes__empty' }, [
          h('p', { text: 'No hay estudiantes inscritos en esta sección.' }),
          h('p', { text: 'Prueba con otro año, otra sección u otro año escolar.' }),
        ]),
      ]),
    )
  }

  function renderRoster(data) {
    if (data.total === 0) {
      renderEmpty(data)
      return
    }

    const rows = data.estudiantes.map((student, index) =>
      h('tr', {}, [
        h('td', { class: 'reportes__num', text: String(index + 1) }),
        h('td', { class: 'reportes__name', text: fullName(student) }),
        h('td', { class: 'reportes__ci', text: ciText(student) }),
        h('td', { text: sexoLabel(student.sexo) }),
        h('td', { class: 'reportes__phone', text: phoneText(student) }),
        h('td', { class: 'reportes__email', text: emailText(student) }),
      ]),
    )

    results.replaceChildren(
      h('article', { class: 'card reportes__card' }, [
        h('div', { class: 'reportes__card-head' }, [
          h('div', { class: 'reportes__card-title' }, [
            h('span', { class: 'reportes__eyebrow', text: 'Vista previa' }),
            h('h3', { text: 'Lista de estudiantes' }),
            h('p', { class: 'reportes__meta', text: groupLabel(data.filtros) }),
          ]),
          h('div', { class: 'reportes__card-actions' }, [
            h('span', {
              class: 'badge reportes__badge',
              text: `${data.total} estudiante${data.total === 1 ? '' : 's'}`,
            }),
            h(
              'button',
              {
                class: 'btn btn--primary reportes__imprimir',
                type: 'button',
                on: { click: printRoster },
              },
              [icon('printer'), h('span', { text: 'Imprimir' })],
            ),
          ]),
        ]),
        h('div', { class: 'reportes__table-wrap' }, [
          h('table', { class: 'reportes__table' }, [
            h('thead', {}, [
              h('tr', {}, [
                h('th', { scope: 'col', text: 'N°' }),
                h('th', { scope: 'col', text: 'Apellidos y nombres' }),
                h('th', { scope: 'col', text: 'Cédula' }),
                h('th', { scope: 'col', text: 'Sexo' }),
                h('th', { scope: 'col', text: 'Teléfono' }),
                h('th', { scope: 'col', text: 'Correo' }),
              ]),
            ]),
            h('tbody', {}, rows),
          ]),
        ]),
      ]),
    )
  }

  async function printRoster() {
    if (!current || current.total === 0) {
      return
    }
    printArea.replaceChildren(buildSheet(current))
    // The crest is a cold-cache decode; printing before it settles paints its
    // alt text instead of the image, the same trap as the letterhead.
    const images = [...printArea.querySelectorAll('img')]
    await Promise.all(
      images.map((image) => (image.decode ? image.decode().catch(() => {}) : Promise.resolve())),
    )
    doPrint()
  }

  function load() {
    const anio = anioSelect.value
    const seccion = seccionSelect.value
    if (!anio || !seccion) {
      results.replaceChildren(
        h('p', { class: 'reportes__status', text: 'Elegí un año y una sección.' }),
      )
      return
    }

    const id = ++seq
    current = null
    results.replaceChildren(h('p', { class: 'reportes__status', text: 'Cargando lista…' }))
    api
      .reporteSeccion({ anio, seccion })
      .then((data) => {
        if (id !== seq) return
        current = data
        renderRoster(data)
      })
      .catch((error) => {
        if (id === seq) renderError(error)
      })
  }

  // Sections belong to a year: changing the year re-fills them and never leaves
  // a section selected that the new year does not offer.
  anioSelect.addEventListener('change', () => {
    const year = (options?.years ?? []).find((entry) => entry.label === anioSelect.value)
    fillSections(year ? year.sections : [])
    results.replaceChildren()
    current = null
  })
  seccionSelect.addEventListener('change', () => {
    if (seccionSelect.value) {
      load()
    }
  })

  loadFilters()
}
