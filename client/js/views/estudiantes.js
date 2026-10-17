// Estudiantes view: student list with search and year/section filters, the
// full record modal (ficha) and the inscription form. Consumes /api/estudiantes*
// and /api/academico/opciones. Markup is built with h() and textContent only
// (AGENTS/docs/ARQUITECTURA.md §6: no innerHTML with data).

import { h, clear } from '../ui/dom.js'
import { errorCopy } from '../ui/messages.js'
import { api } from '../api.js'
import { icon } from '../ui/icons.js'
import { openModal } from '../ui/modal.js'
import { openInscripcion, DOC_LABELS } from '../features/inscripcion.js'

const fmt = new Intl.NumberFormat('es-VE')

/** Labels for the optional estudiante fields shown on the ficha. */
const STUDENT_DETAIL_LABELS = {
  telefono: 'Teléfono',
  correo: 'Correo',
  direccion_habitacion: 'Dirección',
  pais_nacimiento: 'País de nacimiento',
  estado_nacimiento: 'Estado de nacimiento',
  municipio_nacimiento: 'Municipio de nacimiento',
  lateralidad: 'Lateralidad',
  talla: 'Talla',
  peso: 'Peso',
  camisa: 'Camisa',
  pantalon: 'Pantalón',
  zapatos: 'Zapatos',
  alergico_a: 'Alergias',
  enfermedades_padecidas: 'Enfermedades',
}

/** Format a YYYY-MM-DD value as a short Spanish date without TZ shifts. */
function formatFecha(value) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })
}

function nombreCompleto(estudiante) {
  const parts = [
    estudiante.primer_nombre,
    estudiante.segundo_nombre,
    estudiante.primer_apellido,
    estudiante.segundo_apellido,
  ]
  const nombre = parts.filter(Boolean).join(' ')
  return nombre || 'Estudiante'
}

/**
 * @param {HTMLElement} container
 */
export function renderEstudiantes(container) {
  const qInput = h('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Buscar por nombre o cédula…',
    'aria-label': 'Buscar estudiantes por nombre o cédula',
  })
  const searchBtn = h('button', { class: 'btn btn--ghost', type: 'submit' }, [
    icon('search'),
    h('span', { text: 'Buscar' }),
  ])
  const anioSelect = h('select', {
    class: 'estudiantes__select',
    'aria-label': 'Filtrar por año',
    disabled: true,
  })
  const seccionSelect = h('select', {
    class: 'estudiantes__select',
    'aria-label': 'Filtrar por sección',
    disabled: true,
  })
  const results = h('div', { class: 'estudiantes__results' })

  const nuevaBtn = h('button', { class: 'btn btn--primary', type: 'button' }, [
    icon('plus'),
    h('span', { text: 'Nueva inscripción' }),
  ])
  nuevaBtn.addEventListener('click', () => {
    openInscripcion({ opciones: options, onCreated: () => load() })
  })

  // One grid: the search owns the first row and the two filters share the
  // second with the primary action at its end, so the action can never be
  // pushed onto a line of its own. The action stays `type="button"` inside the
  // form: only "Buscar" (submit) reloads the list.
  const bar = h('form', { class: 'estudiantes__bar', on: { submit: (event) => { event.preventDefault(); load() } } }, [
    h('div', { class: 'estudiantes__search' }, [qInput, searchBtn]),
    h('label', { class: 'estudiantes__field' }, [
      h('span', { text: 'Año' }),
      anioSelect,
    ]),
    h('label', { class: 'estudiantes__field' }, [
      h('span', { text: 'Sección' }),
      seccionSelect,
    ]),
    nuevaBtn,
  ])

  const view = h('section', { class: 'estudiantes' }, [
    h('div', { class: 'estudiantes__hero' }, [
      h('h2', { text: 'Estudiantes' }),
      h('p', {
        text: 'Listado del registro: busca por nombre o cédula y filtra por año y sección.',
      }),
    ]),
    bar,
    results,
  ])

  clear(container)
  container.append(view)

  // Incremented on every reload so a slow earlier response never overwrites a
  // newer one after the user changed search terms or filters.
  let seq = 0

  // Options from /api/academico/opciones; kept so the year change handler can
  // resolve the sections of the selected year without another fetch.
  let options = null

  function sexoLabel(value) {
    return value === 'F' ? 'Femenino' : value === 'M' ? 'Masculino' : '—'
  }

  function ciText(student) {
    return student ? `${student.tipo_ci}-${student.numero_ci}` : '—'
  }

  function renderList(data) {
    const { estudiantes } = data
    const count = estudiantes.length

    const summary = h('p', {
      class: 'estudiantes__count',
      text: `${fmt.format(count)} estudiante${count === 1 ? '' : 's'}`,
    })

    if (count === 0) {
      results.replaceChildren(
        summary,
        h('div', { class: 'estudiantes__empty' }, [
          h('p', { text: 'No se encontraron estudiantes.' }),
          h('p', { text: 'Prueba con otra búsqueda o deja los filtros en "Todos".' }),
        ]),
      )
      return
    }

    const table = h('div', { class: 'estudiantes__table-wrap' }, [
      h('table', { class: 'estudiantes__table' }, [
        h('thead', {}, [
          h('tr', {}, [
            h('th', { scope: 'col', text: 'Estudiante' }),
            h('th', { scope: 'col', text: 'Cédula' }),
            h('th', { scope: 'col', text: 'Sexo' }),
            h('th', { scope: 'col', text: 'Teléfono' }),
            h('th', { scope: 'col', text: 'Año' }),
            h('th', { scope: 'col', text: 'Sección' }),
            h('th', { scope: 'col', text: 'Año escolar' }),
          ]),
        ]),
        h('tbody', {},
          estudiantes.map((student) => {
            const name = `${student.primer_nombre} ${student.primer_apellido}`
            return h('tr', {
              class: 'estudiantes__row',
              tabindex: '0',
              dataset: { id: student.id },
              'aria-label': `Ver ficha de ${name}`,
              on: {
                click: () => openFicha(student.id),
                keydown: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openFicha(student.id)
                  }
                },
              },
            }, [
              h('td', { class: 'estudiantes__name', text: name }),
              h('td', { class: 'estudiantes__ci', text: ciText(student) }),
              h('td', {}, [h('span', { class: 'badge', text: sexoLabel(student.sexo) })]),
              h('td', { text: student.telefono || '—' }),
              h('td', { text: student.anio || '—' }),
              h('td', { text: student.seccion || '—' }),
              h('td', { text: student.anio_escolar || '—' }),
            ])
          }),
        ),
      ]),
    ])

    results.replaceChildren(summary, table)
  }

  function renderError(error) {
    const message = errorCopy(error, 'No se pudieron cargar los estudiantes.')
    results.replaceChildren(
      h('div', { class: 'estudiantes__error' }, [
        h('p', { text: message }),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: load } }, [
          h('span', { text: 'Reintentar' }),
        ]),
      ]),
    )
  }

  function renderFiltersError(error) {
    const message = errorCopy(error, 'No se pudieron cargar los filtros.')
    results.replaceChildren(
      h('div', { class: 'estudiantes__error' }, [
        h('p', { text: message }),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: loadFilters } }, [
          h('span', { text: 'Reintentar' }),
        ]),
      ]),
    )
  }

  /** Open the full record of one student (GET /estudiantes/:id) in a modal. */
  function openFicha(id) {
    const status = h('p', { class: 'estudiantes__status', text: 'Cargando ficha…' })

    let closeFicha = null
    const closeButton = h('button', {
      class: 'btn btn--ghost',
      type: 'button',
      on: { click: () => closeFicha?.() },
    }, [h('span', { text: 'Cerrar' })])
    const modal = openModal({ title: 'Ficha del estudiante', content: status, footer: [closeButton] })
    closeFicha = modal.close

    api
      .estudiante(id)
      .then((record) => {
        modal.element.querySelector('.modal__body')?.replaceChildren(renderFicha(record))
      })
      .catch((error) => {
        const message = errorCopy(error, 'No se pudo cargar la ficha.')
        modal.element.querySelector('.modal__body')?.replaceChildren(
          h('div', { class: 'alert alert--error', role: 'alert' }, [h('p', { text: message })]),
        )
      })
  }

  /** Build the ficha body from a GET /estudiantes/:id response. */
  function renderFicha(record) {
    const { estudiante, inscripciones, representantes } = record
    const name = nombreCompleto(estudiante)

    const head = h('header', { class: 'ficha__head' }, [
      h('h3', { class: 'ficha__name', text: name }),
      h('p', { class: 'ficha__meta', text: [
        `${estudiante.tipo_ci}-${estudiante.numero_ci}`,
        sexoLabel(estudiante.sexo),
        formatFecha(estudiante.fecha_nacimiento),
      ].filter((value) => value && value !== '—').join(' · ') }),
    ])

    const details = Object.entries(STUDENT_DETAIL_LABELS)
      .map(([key, label]) => [label, estudiante[key]])
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')

    const detailList =
      details.length > 0
        ? h('dl', { class: 'ficha__grid' },
            details.flatMap(([label, value]) => [
              h('dt', { text: label }),
              h('dd', { text: String(value) }),
            ]),
          )
        : null

    const inscriptions =
      inscripciones.length > 0
        ? inscripciones.map((ins) => {
            // Exactly one status, never two: a regular registration (new
            // admission or promotion to the next year) or a repeater. If legacy
            // data carries both flags, `repite` wins — a repeater must not be
            // hidden behind a "regular" chip.
            const statuses = [
              ins.repite
                ? h('span', { class: 'chip chip--danger', text: 'Repite el año' })
                : h('span', { class: 'chip chip--success', text: 'Inscripción regular' }),
            ]

            return h('article', { class: 'ficha__ins' }, [
              h('header', { class: 'ficha__ins-head' }, [
                h('h4', { class: 'ficha__ins-title', text: `${ins.anio} · Sección ${ins.seccion}` }),
                h('span', { class: 'chip', text: ins.anio_escolar }),
              ]),
              h('div', { class: 'ficha__ins-status' }, [
                h('span', { class: 'ficha__ins-date', text: `Inscrito el ${formatFecha(ins.fecha_inscripcion)}` }),
                ...statuses,
              ]),
              h('div', { class: 'ficha__docs' }, renderDocs(ins.documentos)),
            ])
          })
        : [h('p', { class: 'ficha__empty', text: 'Sin inscripciones registradas.' })]

    const reps =
      representantes.length > 0
        ? representantes.map((rep) =>
            h('article', { class: 'ficha__rep' }, [
              h('h4', { text: rep.nombre }),
              h('p', { class: 'ficha__rep-meta', text: [
                rep.parentesco ? `Parentesco: ${rep.parentesco}` : null,
                `${rep.tipo_ci}-${rep.numero_ci}`,
                rep.telefono,
                rep.correo,
              ].filter(Boolean).join(' · ') }),
            ]),
          )
        : [h('p', { class: 'ficha__empty', text: 'Sin representantes registrados.' })]

    return h('div', { class: 'ficha' }, [
      head,
      detailList,
      h('section', { class: 'ficha__section' }, [
        h('h4', { class: 'ficha__section-title', text: 'Inscripciones' }),
        ...inscriptions,
      ]),
      h('section', { class: 'ficha__section' }, [
        h('h4', { class: 'ficha__section-title', text: 'Representantes' }),
        ...reps,
      ]),
    ])
  }

  /** Document chips for one inscripcion; passes the full list through. */
  function renderDocs(documentos) {
    if (!documentos) {
      return [h('span', { class: 'ficha__docs-empty', text: 'Sin documentos consignados' })]
    }
    const chips = Object.entries(DOC_LABELS)
      .filter(([key]) => documentos[key])
      .map(([, label]) => h('span', { class: 'chip', text: label }))
    return chips.length > 0
      ? chips
      : [h('span', { class: 'ficha__docs-empty', text: 'Sin documentos consignados' })]
  }

  function load() {
    const id = ++seq
    results.replaceChildren(h('p', { class: 'estudiantes__status', text: 'Cargando estudiantes…' }))
    api
      .estudiantes({ q: qInput.value, anio: anioSelect.value, seccion: seccionSelect.value })
      .then((data) => {
        if (id === seq) renderList(data)
      })
      .catch((error) => {
        if (id === seq) renderError(error)
      })
  }

  // Bound once: search and filter changes re-query but must not stack handlers.
  let searchTimer = null
  qInput.addEventListener('input', () => {
    clearTimeout(searchTimer)
    // Search on Enter/submit; on every keystroke we only debounce to avoid
    // flooding the DB with requests. The user may also press Enter or the
    // "Buscar" button (both trigger the form submit). We do not fire on input
    // anymore.
  })

  anioSelect.addEventListener('change', () => {
    const year = (options?.years ?? []).find((entry) => entry.label === anioSelect.value)
    const sections = year ? year.sections : collectSections(options?.years ?? [])
    fillSections(sections)
    if (!sections.includes(seccionSelect.value)) {
      seccionSelect.value = ''
    }
    load()
  })
  seccionSelect.addEventListener('change', load)

  /** Union of every section label across all years, in first-seen order. */
  function collectSections(years) {
    const sections = []
    const seen = new Set()
    for (const year of years) {
      for (const section of year.sections) {
        if (!seen.has(section)) {
          seen.add(section)
          sections.push(section)
        }
      }
    }
    return sections
  }

  function fillSections(sections) {
    seccionSelect.replaceChildren(
      h('option', { value: '', text: 'Todas las secciones' }),
      ...sections.map((section) => h('option', { value: section, text: section })),
    )
  }

  /** @param {{ years: Array<{ label: string, sections: string[] }> }} academic */
  function fillFilters(academic) {
    options = academic
    const years = options.years ?? []

    anioSelect.replaceChildren(
      h('option', { value: '', text: 'Todos los años' }),
      ...years.map((year) => h('option', { value: year.label, text: year.label })),
    )
    anioSelect.disabled = false
    anioSelect.value = ''

    fillSections(collectSections(years))
    seccionSelect.value = ''
    seccionSelect.disabled = false

    load()
  }

  function loadFilters() {
    api
      .opciones()
      .then(fillFilters)
      .catch(renderFiltersError)
  }

  loadFilters()
}