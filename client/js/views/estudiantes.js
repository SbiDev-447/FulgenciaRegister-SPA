// Estudiantes view: student list with search and year/section filters, the
// full record modal (ficha) and the inscription form. Consumes /api/estudiantes*
// and /api/academico/opciones. Markup is built with h() and textContent only
// (AGENTS/docs/ARQUITECTURA.md §6: no innerHTML with data).

import { h, clear, autoSeparateDate } from '../ui/dom.js'
import { errorCopy } from '../ui/messages.js'
import {
  isValidEmail,
  isValidPhone,
  parseLatamDate,
  formatLatamDate,
  formatToday,
  DATE_FIELD_LENGTH,
} from '../ui/format.js'
import { api } from '../api.js'
import { icon } from '../ui/icons.js'
import { openModal } from '../ui/modal.js'
import { INSTITUTION } from '../institution.js'
import { DOC_LABELS } from '../features/inscripcion.js'

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

/** Select options shared with the inscription wizard, so stored values match. */
const SEXO_OPTIONS = [
  { value: '', label: 'Selecciona…' },
  { value: 'F', label: 'Femenino' },
  { value: 'M', label: 'Masculino' },
]

const LATERALIDAD_OPTIONS = [
  { value: '', label: 'Selecciona…' },
  { value: 'Derecha', label: 'Derecha' },
  { value: 'Izquierda', label: 'Izquierda' },
  { value: 'Ambidiestro', label: 'Ambidiestro' },
]

/**
 * The student's own fields, in form order, with the label the form shows.
 *
 * `required` mirrors the API, verified against it: a partial update validates
 * every field it receives, so a validated field answers 400 to an empty string.
 * The form keeps those required rather than dropping the edit silently.
 *
 * The optional fields may be blanked, and they are cleared with `null`: an empty
 * string is a 500 on the decimal `peso` column, while `null` is safe for all of
 * them.
 *
 * `format` names the extra check a field needs on top of "not empty".
 */
const EDIT_FIELDS = [
  { name: 'primer_nombre', label: 'Primer nombre *', required: true },
  { name: 'segundo_nombre', label: 'Segundo nombre *', required: true },
  { name: 'primer_apellido', label: 'Primer apellido *', required: true },
  { name: 'segundo_apellido', label: 'Segundo apellido *', required: true },
  {
    name: 'fecha_nacimiento',
    label: 'Fecha de nacimiento *',
    required: true,
    inputmode: 'numeric',
    placeholder: 'dd/mm/aaaa',
    format: 'date',
  },
  { name: 'sexo', label: 'Sexo *', required: true, options: SEXO_OPTIONS },
  {
    name: 'telefono',
    label: 'Teléfono *',
    required: true,
    inputmode: 'tel',
    placeholder: '0414-1234567',
    format: 'phone',
  },
  {
    name: 'correo',
    label: 'Correo *',
    required: true,
    type: 'email',
    placeholder: 'correo@ejemplo.com',
    format: 'email',
  },
  { name: 'pais_nacimiento', label: 'País de nacimiento *', required: true, placeholder: 'Venezuela' },
  { name: 'estado_nacimiento', label: 'Estado de nacimiento *', required: true, placeholder: 'Estado' },
  { name: 'municipio_nacimiento', label: 'Municipio de nacimiento *', required: true, placeholder: 'Municipio' },
  { name: 'lateralidad', label: 'Lateralidad *', required: true, options: LATERALIDAD_OPTIONS },
  { name: 'talla', label: 'Talla (cm)', placeholder: 'cm' },
  { name: 'peso', label: 'Peso (kg)', placeholder: 'kg', format: 'decimal' },
  { name: 'camisa', label: 'Camisa', placeholder: 'Ej: S, M, L…' },
  { name: 'pantalon', label: 'Pantalón', placeholder: 'Ej: 30, 32…' },
  { name: 'zapatos', label: 'Zapatos', placeholder: 'Ej: 34, 36…' },
  { name: 'alergico_a', label: 'Alérgico a', placeholder: 'Alimentos, medicamentos…' },
  { name: 'enfermedades_padecidas', label: 'Enfermedades padecidas', placeholder: 'Cuales padece…', full: true },
  { name: 'direccion_habitacion', label: 'Dirección de habitación', placeholder: 'Sector, calle, casa…', full: true },
]

/** Shared by the edit form and the submit button that lives in the modal footer. */
const EDIT_FORM_ID = 'estudiante-edit-form'

/** The step-over form's id, so its footer button submits it from outside. */
const NUEVA_INSCRIPCION_FORM_ID = 'estudiante-nueva-inscripcion-form'

/** Icon per row action; the label lives in aria-label and title. */
const ROW_ACTION_ICONS = { ver: 'eye', editar: 'edit', borrar: 'trash' }

/**
 * The school year after `value` (`2025-2026` -> `2026-2027`), or the current
 * one when there is no readable previous year.
 * @param {unknown} value
 * @returns {string}
 */
function nextSchoolYear(value) {
  const now = new Date()
  const match = /^(\d{4})-\d{4}$/.exec(String(value ?? '').trim())
  if (!match) return `${now.getFullYear()}-${now.getFullYear() + 1}`
  const start = Number(match[1]) + 1
  return `${start}-${start + 1}`
}

/**
 * Format a stored date as `dd/mm/yyyy`, the order a Latin American reader
 * expects, and never through the browser locale.
 *
 * The API answers ISO datetimes (`2014-08-20T04:30:00.000Z`). The old version
 * appended a time to that whole string, produced an Invalid Date, and returned a
 * dash — which the ficha then filtered out, so the birth date disappeared from
 * the header without anyone noticing. The rule now lives in ui/format.js, shared
 * with the edit field and the wizard so all three read a date the same way; the
 * dash here is this view's way of showing a missing date.
 */
function formatFecha(value) {
  return formatLatamDate(value) || '—'
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
 * @param {{ print?: () => void }} [options] - `print` lets a test observe the
 *   call without opening the browser's print dialog.
 */
export function renderEstudiantes(container, { print } = {}) {
  const doPrint = print ?? (() => window.print())
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
  // Off-screen sheet the ficha prints from. Keeping it out of the modal means
  // the paper carries the record and not the dialog chrome, and the on-screen
  // ficha stays interactive.
  const printArea = h('div', { class: 'ficha-print', 'aria-hidden': 'true' })

  const nuevaBtn = h('button', { class: 'btn btn--primary', type: 'button' }, [
    icon('plus'),
    h('span', { text: 'Nueva inscripción' }),
  ])
  nuevaBtn.addEventListener('click', () => {
    // The inscription form is a page of its own (S22): navigate to it rather
    // than opening a popup, so the browser's back button works and the form gets
    // the full width.
    window.location.hash = '/inscripcion'
  })

  // One grid: the search owns the first row and the two filters share the
  // second with the primary action at its end, so the action can never be
  // pushed onto a line of its own. The action stays `type="button"` inside the
  // form: only "Buscar" (submit) reloads the list.
  const bar = h('form', { class: 'estudiantes__bar', on: { submit: (event) => { event.preventDefault(); load({ resetPage: true }) } } }, [
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
    printArea,
  ])

  clear(container)
  container.append(view)

  // Incremented on every reload so a slow earlier response never overwrites a
  // newer one after the user changed search terms or filters.
  let seq = 0

  // 1-based page of the current query. The server owns the paging; the view only
  // remembers which page it asked for and resets it whenever the query changes,
  // because page 4 of a different filter is not a place anyone meant to go.
  let page = 1

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
    const total = data.total ?? estudiantes.length
    const pageSize = data.pageSize ?? Math.max(estudiantes.length, 1)
    const pages = data.pages ?? 1
    const current = data.page ?? page

    const summary = h('p', {
      class: 'estudiantes__count',
      text:
        pages > 1
          ? `Mostrando ${fmt.format((current - 1) * pageSize + 1)}–${fmt.format(
              (current - 1) * pageSize + estudiantes.length,
            )} de ${fmt.format(total)} estudiantes`
          : `${fmt.format(total)} estudiante${total === 1 ? '' : 's'}`,
    })

    if (estudiantes.length === 0) {
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
            h('th', { scope: 'col', text: 'Acciones' }),
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
                  // Enter/space inside the actions column belongs to the button
                  // that has focus, never to the row underneath it.
                  if (event.target?.closest?.('.estudiantes__actions')) {
                    return
                  }
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
              h('td', { class: 'estudiantes__actions' }, [
                h('div', { class: 'estudiantes__actions-row' }, [
                  rowAction('Ver', 'ver', name, () => openFicha(student.id)),
                  rowAction('Editar', 'editar', name, () => openEditForm(student.id)),
                  rowAction('Borrar', 'borrar', name, () => confirmDelete(student), 'btn--danger'),
                ]),
              ]),
            ])
          }),
        ),
      ]),
    ])

    results.replaceChildren(summary, table)
    if (pages > 1) {
      results.append(renderPager(current, pages))
    }
  }

  /**
   * Previous / next navigation, the same shape as the enrolment wizard: the page
   * number is the state, and both ends are disabled instead of wrapping around.
   * `disabled` is set as a property, not the attribute, so a browser and the
   * test stub agree on what `button.disabled` reports.
   */
  function renderPager(current, pages) {
    const prev = h('button', {
      class: 'btn btn--ghost',
      type: 'button',
      'aria-label': 'Página anterior',
      text: 'Anterior',
    })
    prev.disabled = current <= 1
    prev.addEventListener('click', () => goToPage(current - 1))

    const next = h('button', {
      class: 'btn btn--ghost',
      type: 'button',
      'aria-label': 'Página siguiente',
      text: 'Siguiente',
    })
    next.disabled = current >= pages
    next.addEventListener('click', () => goToPage(current + 1))

    return h('nav', { class: 'estudiantes__pager', 'aria-label': 'Paginación de estudiantes' }, [
      prev,
      h('span', { class: 'estudiantes__pager-info', text: `Página ${current} de ${pages}` }),
      next,
    ])
  }

  function goToPage(target) {
    page = target
    load()
    // The table is taller than the viewport: without this the person lands on
    // the footer of a list they have not started reading.
    results.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
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

    // The record the print button will use. It stays null while the request is
    // in flight, so a fast click cannot print an empty sheet.
    let record = null
    let closeFicha = null
    const printButton = h(
      'button',
      {
        class: 'btn btn--primary',
        type: 'button',
        disabled: true,
        on: { click: () => record && printFicha(record) },
      },
      [icon('printer'), h('span', { text: 'Imprimir ficha' })],
    )
    const closeButton = h('button', {
      class: 'btn btn--ghost',
      type: 'button',
      on: { click: () => closeFicha?.() },
    }, [h('span', { text: 'Cerrar' })])
    // Step-over action (S5): close the ficha first so the new form never opens
    // on top of another overlay.
    const nuevaInscripcionButton = h('button', {
      class: 'btn btn--ghost',
      type: 'button',
      disabled: true,
      on: {
        click: () => {
          if (!record) return
          const loaded = record
          closeFicha?.()
          openNuevaInscripcion(loaded)
        },
      },
    }, [icon('plus'), h('span', { text: 'Inscribir en nuevo año' })])
    const modal = openModal({
      title: 'Ficha del estudiante',
      content: status,
      footer: [printButton, nuevaInscripcionButton, closeButton],
    })
    closeFicha = modal.close

    api
      .estudiante(id)
      .then((data) => {
        record = data
        printButton.disabled = false
        nuevaInscripcionButton.disabled = false
        modal.element.querySelector('.modal__body')?.replaceChildren(renderFicha(data))
      })
      .catch((error) => {
        const message = errorCopy(error, 'No se pudo cargar la ficha.')
        modal.element.querySelector('.modal__body')?.replaceChildren(
          h('div', { class: 'alert alert--error', role: 'alert' }, [h('p', { text: message })]),
        )
      })
  }

  /**
   * Build the printable sheet from the same record the modal shows, then hand
   * it to the printer. Images are awaited for the same reason as the reporte:
   * printing before the crest decodes paints its alt text.
   */
  async function printFicha(record) {
    printArea.replaceChildren(buildFichaSheet(record))
    const images = [...printArea.querySelectorAll('img')]
    await Promise.all(
      images.map((image) => (image.decode ? image.decode().catch(() => {}) : Promise.resolve())),
    )
    doPrint()
  }

  /** One line with the documents a school actually received, or the empty case. */
  function documentSummary(documentos) {
    if (!documentos) return 'Sin documentos consignados'
    const labels = Object.entries(DOC_LABELS)
      .filter(([key]) => documentos[key])
      .map(([, label]) => label)
    return labels.length > 0 ? labels.join(' · ') : 'Sin documentos consignados'
  }

  /** The paper ficha: letterhead, personal data, inscriptions and representatives. */
  function buildFichaSheet(record) {
    const { estudiante, inscripciones = [], representantes = [] } = record

    // Identity first, then contact, then physical data and health — the order an
    // office reads a record. Empty optional fields disappear so the sheet does
    // not show a row of blanks.
    const groups = [
      {
        title: 'Datos personales',
        rows: [
          ['Cédula', estudiante.tipo_ci && estudiante.numero_ci ? ciText(estudiante) : ''],
          ['Sexo', estudiante.sexo ? sexoLabel(estudiante.sexo) : ''],
          ['Fecha de nacimiento', formatFecha(estudiante.fecha_nacimiento)],
          ['País de nacimiento', estudiante.pais_nacimiento],
          ['Estado de nacimiento', estudiante.estado_nacimiento],
          ['Municipio de nacimiento', estudiante.municipio_nacimiento],
        ],
      },
      {
        title: 'Contacto',
        rows: [
          ['Teléfono', estudiante.telefono],
          ['Correo', estudiante.correo],
          ['Dirección', estudiante.direccion_habitacion],
        ],
      },
      {
        title: 'Datos físicos y salud',
        rows: [
          ['Lateralidad', estudiante.lateralidad],
          ['Talla', estudiante.talla],
          ['Peso', estudiante.peso],
          ['Camisa', estudiante.camisa],
          ['Pantalón', estudiante.pantalon],
          ['Zapatos', estudiante.zapatos],
          ['Alergias', estudiante.alergico_a],
          ['Enfermedades', estudiante.enfermedades_padecidas],
        ],
      },
    ]
      .map((group) => ({
        ...group,
        rows: group.rows.filter(
          ([, value]) => value !== undefined && value !== null && String(value).trim() !== '',
        ),
      }))
      .filter((group) => group.rows.length > 0)

    return h('main', { class: 'ficha-sheet' }, [
      h('header', { class: 'ficha-sheet__head' }, [
        h('img', { class: 'ficha-sheet__logo', src: INSTITUTION.logo, alt: '' }),
        h('h1', { class: 'ficha-sheet__school', text: INSTITUTION.school }),
        h('h2', { class: 'ficha-sheet__title', text: 'Ficha del estudiante' }),
      ]),
      h('section', { class: 'ficha-sheet__section' }, [
        h('h3', { class: 'ficha-sheet__name', text: nombreCompleto(estudiante) }),
        ...(groups.length > 0
          ? groups.map((group) =>
              h('div', { class: 'ficha-sheet__group' }, [
                h('h4', { class: 'ficha-sheet__group-title', text: group.title }),
                h('dl', { class: 'ficha-sheet__grid' },
                  group.rows.flatMap(([label, value]) => [
                    h('dt', { text: label }),
                    h('dd', { text: String(value) }),
                  ]),
                ),
              ]),
            )
          : [h('p', { class: 'ficha-sheet__empty', text: 'Sin datos adicionales registrados.' })]),
      ]),
      h('section', { class: 'ficha-sheet__section' }, [
        h('h3', { class: 'ficha-sheet__section-title', text: 'Inscripciones' }),
        ...(inscripciones.length > 0
          ? inscripciones.map((ins) =>
              h('article', { class: 'ficha-sheet__item' }, [
                h('div', { class: 'ficha-sheet__item-head' }, [
                  h('strong', { text: `${ins.anio} · Sección ${ins.seccion}` }),
                  h('span', { text: ins.anio_escolar }),
                ]),
                h('p', {
                  text: `Inscrito el ${formatFecha(ins.fecha_inscripcion)} · ${
                    ins.repite ? 'Repite el año' : 'Inscripción regular'
                  }`,
                }),
                h('p', { class: 'ficha-sheet__docs', text: documentSummary(ins.documentos) }),
              ]),
            )
          : [h('p', { class: 'ficha-sheet__empty', text: 'Sin inscripciones registradas.' })]),
      ]),
      h('section', { class: 'ficha-sheet__section' }, [
        h('h3', { class: 'ficha-sheet__section-title', text: 'Representantes' }),
        ...(representantes.length > 0
          ? representantes.map((rep) =>
              h('article', { class: 'ficha-sheet__item' }, [
                h('div', { class: 'ficha-sheet__item-head' }, [
                  h('strong', { text: rep.nombre }),
                  rep.parentesco ? h('span', { text: `Parentesco: ${rep.parentesco}` }) : null,
                ]),
                h('p', {
                  text: [`${rep.tipo_ci}-${rep.numero_ci}`, rep.telefono, rep.correo]
                    .filter(Boolean)
                    .join(' · '),
                }),
              ]),
            )
          : [h('p', { class: 'ficha-sheet__empty', text: 'Sin representantes registrados.' })]),
      ]),
      h('footer', { class: 'ficha-sheet__foot' }, [
        h('span', { text: `Impreso el ${formatToday()}` }),
      ]),
    ])
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

  /**
   * One button of the actions column. The row itself opens the ficha, so the
   * button stops the click from bubbling: one press must do one thing.
   */
  function rowAction(label, kind, name, onClick, extra = '') {
    const classes = ['btn', 'btn--ghost', 'btn--sm', `estudiantes__action--${kind}`]
    if (extra) {
      classes.push(extra)
    }
    return h('button', {
      class: classes.join(' '),
      type: 'button',
      'aria-label': `${label}: ${name}`,
      title: label,
      on: {
        click: (event) => {
          event.stopPropagation()
          onClick()
        },
      },
    }, [icon(ROW_ACTION_ICONS[kind])])
  }

  /** A labelled control, with the same field markup the wizard uses. */
  function editField(label, control, { full = false } = {}) {
    return h('label', { class: full ? 'field field--full' : 'field' }, [
      h('span', { class: 'field__label', text: label }),
      control,
    ])
  }

  /** The control for one editable field, pre-filled with the stored value. */
  function editControl(field, value) {
    const raw = value === null || value === undefined ? '' : String(value)

    if (field.options) {
      const select = h('select', { class: 'input', name: field.name })
      select.append(
        ...field.options.map((option) => h('option', { value: option.value, text: option.label })),
      )
      select.value = raw
      return select
    }

    const props = {
      class: 'input',
      name: field.name,
      type: field.type ?? 'text',
      // A stored date is re-written as dd/mm/aaaa instead of being handed to a
      // native picker, whose shown order follows the browser (see format.js).
      value: field.format === 'date' ? formatLatamDate(raw) : raw,
      placeholder: field.placeholder,
    }
    if (field.inputmode) {
      props.inputmode = field.inputmode
    }
    if (field.format === 'date') {
      // Long enough for dd/mm/aaaa and nothing else: the extra character also
      // stops an insertion in the middle from pushing past ten.
      props.maxlength = DATE_FIELD_LENGTH
    }
    const control = h('input', props)
    if (field.format === 'date') {
      autoSeparateDate(control)
    }
    return control
  }

  /**
   * Edit the student's own record (PUT /estudiantes/:id). The cédula pair is
   * immutable — shown, never sent — and inscriptions, representatives and
   * consigned documents keep their own flows, so they are out of this form.
   */
  function openEditForm(id) {
    const status = h('p', { class: 'estudiantes__status', text: 'Cargando datos…' })

    let closeEdit = null
    const cancelBtn = h('button', {
      class: 'btn btn--ghost',
      type: 'button',
      on: { click: () => closeEdit?.() },
    }, [h('span', { text: 'Cancelar' })])
    const saveBtn = h('button', {
      class: 'btn btn--primary',
      type: 'submit',
      form: EDIT_FORM_ID,
      disabled: true,
    }, [h('span', { text: 'Guardar cambios' })])
    const modal = openModal({ title: 'Editar estudiante', content: status, footer: [cancelBtn, saveBtn] })
    closeEdit = modal.close

    api
      .estudiante(id)
      .then((record) => {
        saveBtn.disabled = false
        modal.element.querySelector('.modal__body')?.replaceChildren(
          renderEditForm(record, {
            saveBtn,
            onSaved: () => {
              modal.close()
              load()
            },
          }),
        )
      })
      .catch((error) => {
        const message = errorCopy(error, 'No se pudieron cargar los datos del estudiante.')
        modal.element.querySelector('.modal__body')?.replaceChildren(
          h('div', { class: 'alert alert--error', role: 'alert' }, [h('p', { text: message })]),
        )
      })
  }

  /** The edit form, filled from GET /estudiantes/:id. */
  function renderEditForm(record, { saveBtn, onSaved }) {
    const { estudiante } = record
    const representante = record.representantes?.[0] ?? null
    const errorHost = h('div', { class: 'ficha-form__errors' })
    const controls = new Map()
    const repControls = new Map()

    const ciType = h('select', {
      class: 'input',
      name: 'tipo_ci',
      disabled: true,
      'aria-label': 'Tipo de cédula (no editable)',
    }, [h('option', { value: 'V', text: 'V' }), h('option', { value: 'E', text: 'E' })])
    ciType.value = estudiante.tipo_ci ?? 'V'

    const ciNumber = h('input', {
      class: 'input',
      name: 'numero_ci',
      type: 'text',
      value: estudiante.numero_ci ?? '',
      readonly: true,
      'aria-label': 'Cédula del estudiante (no editable)',
    })

    // The representative is its own person and may be shared by siblings, so
    // the edit is sent with its id: the API updates that row in place and every
    // linked student sees the new data. Parentesco, on the other hand, belongs
    // to the link and stays specific to this student.
    const repName = h('input', {
      class: 'input',
      name: 'representante_nombre',
      type: 'text',
      value: representante?.nombre ?? '',
    })
    const repCiType = h('select', {
      class: 'input',
      name: 'representante_tipo_ci',
      'aria-label': 'Tipo de cédula del representante',
    }, [h('option', { value: 'V', text: 'V' }), h('option', { value: 'E', text: 'E' })])
    repCiType.value = representante?.tipo_ci ?? 'V'
    const repCiNumber = h('input', {
      class: 'input',
      name: 'representante_numero_ci',
      type: 'text',
      inputmode: 'numeric',
      value: representante?.numero_ci ?? '',
      'aria-label': 'Cédula del representante',
    })
    const repPhone = h('input', {
      class: 'input',
      name: 'representante_telefono',
      type: 'text',
      value: representante?.telefono ?? '',
    })
    const repEmail = h('input', {
      class: 'input',
      name: 'representante_correo',
      type: 'email',
      value: representante?.correo ?? '',
    })
    const repParentesco = h('input', {
      class: 'input',
      name: 'representante_parentesco',
      type: 'text',
      value: representante?.parentesco ?? '',
      placeholder: 'Ej: Madre',
    })
    if (representante) {
      repControls.set('nombre', repName)
      repControls.set('numero_ci', repCiNumber)
      repControls.set('telefono', repPhone)
      repControls.set('correo', repEmail)
    }

    const representativeSection = representante
      ? [
          h('h3', { class: 'ficha-form__section-title', text: 'Representante' }),
          editField('Nombre del representante *', repName, { full: true }),
          editField(
            'Cédula del representante *',
            h('div', { class: 'ficha-form__ci' }, [repCiType, repCiNumber]),
            { full: true },
          ),
          editField('Teléfono del representante *', repPhone),
          editField('Correo del representante *', repEmail),
          editField('Parentesco', repParentesco),
          h('p', {
            class: 'ficha-form__hint',
            text: 'Si este representante está compartido, sus datos personales se actualizan para todos sus estudiantes.',
          }),
        ]
      : []

    const grid = h('div', { class: 'ficha-form__grid' }, [
      editField('Cédula', h('div', { class: 'ficha-form__ci' }, [ciType, ciNumber]), { full: true }),
      ...EDIT_FIELDS.map((field) => {
        const control = editControl(field, estudiante[field.name])
        controls.set(field.name, control)
        return editField(field.label, control, { full: field.full })
      }),
      ...representativeSection,
    ])

    function clearProblems() {
      errorHost.replaceChildren()
      for (const control of [...controls.values(), ...repControls.values()]) {
        control.classList.remove('input-error')
      }
    }

    function showProblems(problems) {
      for (const { control } of problems) {
        control.classList.add('input-error')
      }
      errorHost.replaceChildren(
        h('div', { class: 'alert alert--error', role: 'alert' }, [
          h('p', { text: 'Revisa los campos marcados:' }),
          h('ul', {}, problems.map((problem) => h('li', { text: problem.message }))),
        ]),
      )
      problems[0]?.control.focus()
    }

    function validate() {
      const problems = []
      for (const field of EDIT_FIELDS) {
        const control = controls.get(field.name)
        const value = String(control.value ?? '').trim()
        const label = field.label.replace(' *', '')

        if (field.required && value === '') {
          problems.push({ control, message: `${label} es obligatorio.` })
          continue
        }
        if (value === '') {
          continue
        }
        if (field.format === 'email' && !isValidEmail(value)) {
          problems.push({ control, message: 'El correo del estudiante no tiene un formato válido.' })
        }
        if (field.format === 'phone' && !isValidPhone(value)) {
          problems.push({ control, message: 'El teléfono del estudiante no tiene un formato válido.' })
        }
        if (field.format === 'decimal' && !/^\d+([.,]\d+)?$/.test(value)) {
          problems.push({ control, message: 'El peso debe ser un número (ej: 55.5).' })
        }
        if (field.format === 'date' && !parseLatamDate(value)) {
          problems.push({
            control,
            message: `${label} debe tener la forma dd/mm/aaaa (ej: 04/03/2010).`,
          })
        }
      }

      if (representante) {
        const repNameValue = repName.value.trim()
        const repCiDigits = repCiNumber.value.replace(/\D/g, '')
        const repPhoneValue = repPhone.value.trim()
        const repEmailValue = repEmail.value.trim()

        if (!repNameValue) {
          problems.push({ control: repName, message: 'El nombre del representante es obligatorio.' })
        }
        if (!repCiDigits || repCiDigits.length > 12) {
          problems.push({
            control: repCiNumber,
            message: 'La cédula del representante debe tener entre 1 y 12 dígitos.',
          })
        }
        if (!repPhoneValue) {
          problems.push({ control: repPhone, message: 'El teléfono del representante es obligatorio.' })
        } else if (!isValidPhone(repPhoneValue)) {
          problems.push({
            control: repPhone,
            message: 'El teléfono del representante no tiene un formato válido.',
          })
        }
        if (!repEmailValue) {
          problems.push({ control: repEmail, message: 'El correo del representante es obligatorio.' })
        } else if (!isValidEmail(repEmailValue)) {
          problems.push({
            control: repEmail,
            message: 'El correo del representante no tiene un formato válido.',
          })
        }
      }

      return problems
    }

    /**
     * The PUT payload. A blanked optional field is `null`, never "": an empty
     * string is a 500 on the decimal `peso` column, and for the validated fields
     * it is a 400 — which is why those stay required. `peso` also takes the
     * comma people type here, and a written date goes back to ISO, which is what
     * the API stores (validate() already refused anything unreadable).
     */
    function collect() {
      const patch = {}
      for (const field of EDIT_FIELDS) {
        const value = String(controls.get(field.name).value ?? '').trim()
        if (value === '') {
          patch[field.name] = null
        } else if (field.format === 'decimal') {
          patch[field.name] = value.replace(',', '.')
        } else if (field.format === 'date') {
          patch[field.name] = parseLatamDate(value)
        } else {
          patch[field.name] = value
        }
      }
      if (!representante) {
        return { estudiante: patch }
      }

      return {
        estudiante: patch,
        representantes: [
          {
            id: representante.id,
            nombre: repName.value.trim(),
            tipo_ci: repCiType.value,
            numero_ci: repCiNumber.value.replace(/\D/g, ''),
            telefono: repPhone.value.trim(),
            correo: repEmail.value.trim(),
            parentesco: repParentesco.value.trim() || null,
          },
        ],
      }
    }

    function onSubmit(event) {
      event.preventDefault()
      clearProblems()

      const problems = validate()
      if (problems.length > 0) {
        showProblems(problems)
        return
      }

      saveBtn.disabled = true
      saveBtn.replaceChildren(h('span', { text: 'Guardando…' }))

      api
        .actualizarEstudiante(estudiante.id, collect())
        .then(() => onSaved())
        .catch((error) => {
          errorHost.replaceChildren(
            h('div', { class: 'alert alert--error', role: 'alert' }, [
              h('p', { text: errorCopy(error, 'No se pudieron guardar los cambios.') }),
            ]),
          )
          saveBtn.disabled = false
          saveBtn.replaceChildren(h('span', { text: 'Guardar cambios' }))
        })
    }

    return h('form', {
      id: EDIT_FORM_ID,
      class: 'ficha-form',
      novalidate: true,
      on: { submit: onSubmit },
    }, [
      h('p', {
        class: 'ficha-form__hint',
        text: 'La cédula identifica al estudiante y no se puede cambiar. Las inscripciones y los documentos se gestionan en sus propias pantallas.',
      }),
      errorHost,
      grid,
    ])
  }

  /**
   * Step-over form (S5): enrol this already-registered student in a new school
   * year. It builds only the inscription and its consigned documents; personal
   * data and representatives keep their own flows. A 409 means the student
   * already has an inscription for that school year.
   */
  function openNuevaInscripcion(record) {
    const years = options?.years ?? []
    const latest = record.inscripciones?.[0]
    const latestDocs = latest?.documentos ?? {}

    const anioSelect = h('select', { class: 'input', name: 'anio' }, [
      h('option', { value: '', text: 'Selecciona…' }),
      ...years.map((year) => h('option', { value: year.label, text: year.label })),
    ])
    const seccionSelect = h('select', { class: 'input', name: 'seccion', disabled: true }, [
      h('option', { value: '', text: 'Selecciona…' }),
    ])
    // The next school year in the sequence, or the current one when the record
    // has no inscription to continue from.
    const anioEscolar = h('input', {
      class: 'input',
      name: 'anio_escolar',
      type: 'text',
      value: nextSchoolYear(latest?.anio_escolar),
      placeholder: 'AAAA-AAAA',
    })
    const fechaInscripcion = h('input', {
      class: 'input',
      name: 'fecha_inscripcion',
      type: 'text',
      inputmode: 'numeric',
      placeholder: 'dd/mm/aaaa',
      maxlength: DATE_FIELD_LENGTH,
      value: formatToday(),
    })
    autoSeparateDate(fechaInscripcion)

    // Native radios sharing a name are mutually exclusive, so "regular" and
    // "repite" cannot both be true.
    const regular = h('input', { type: 'radio', name: 'tipo_inscripcion', checked: true })
    const repite = h('input', { type: 'radio', name: 'tipo_inscripcion' })

    // The six consigned documents start from the most recent inscription's
    // state; the operator may correct them before saving.
    const documentoInputs = Object.entries(DOC_LABELS).map(([key, label]) => {
      const input = h('input', {
        type: 'checkbox',
        name: key,
        checked: Boolean(latestDocs[key]),
      })
      return { key, label, input }
    })

    function fillSectionsForGrade() {
      const year = years.find((entry) => entry.label === anioSelect.value)
      const sections = year ? year.sections : []
      seccionSelect.replaceChildren(
        h('option', { value: '', text: 'Selecciona…' }),
        ...sections.map((section) => h('option', { value: section, text: section })),
      )
      seccionSelect.disabled = sections.length === 0
    }

    // True while the grade came from the "repite" shortcut, so switching back
    // to regular clears it instead of silently keeping the repeated grade.
    let gradeAutoFilled = false
    anioSelect.addEventListener('change', () => {
      gradeAutoFilled = false
      fillSectionsForGrade()
    })

    // Repeating means staying in the same grade. The school year still advances
    // (the year already registered belongs to the current inscription).
    repite.addEventListener('change', () => {
      if (!repite.checked || !latest?.anio) return
      anioSelect.value = latest.anio
      gradeAutoFilled = true
      fillSectionsForGrade()
    })

    regular.addEventListener('change', () => {
      if (!regular.checked || !gradeAutoFilled) return
      gradeAutoFilled = false
      anioSelect.value = ''
      fillSectionsForGrade()
    })

    const errorHost = h('div', { class: 'ficha-form__errors' })

    function clearProblems() {
      errorHost.replaceChildren()
      for (const control of [anioSelect, seccionSelect, anioEscolar, fechaInscripcion]) {
        control.classList.remove('input-error')
      }
    }

    function showProblems(problems) {
      for (const { control } of problems) {
        control.classList.add('input-error')
      }
      errorHost.replaceChildren(
        h('div', { class: 'alert alert--error', role: 'alert' }, [
          h('p', { text: 'Revisa los campos marcados:' }),
          h('ul', {}, problems.map((problem) => h('li', { text: problem.message }))),
        ]),
      )
      problems[0]?.control.focus()
    }

    function validate() {
      const problems = []
      if (!anioSelect.value) {
        problems.push({ control: anioSelect, message: 'Selecciona el año de la nueva inscripción.' })
      } else if (!seccionSelect.value) {
        problems.push({
          control: seccionSelect,
          message: `Selecciona la sección para ${anioSelect.value}.`,
        })
      }
      if (!/^\d{4}-\d{4}$/.test(String(anioEscolar.value ?? '').trim())) {
        problems.push({
          control: anioEscolar,
          message: 'El año escolar debe tener la forma AAAA-AAAA (ej: 2026-2027).',
        })
      }
      if (!parseLatamDate(fechaInscripcion.value)) {
        problems.push({
          control: fechaInscripcion,
          message: 'La fecha de inscripción debe tener la forma dd/mm/aaaa (ej: 15/09/2026).',
        })
      }
      return problems
    }

    let closeForm = null
    const cancelBtn = h('button', {
      class: 'btn btn--ghost',
      type: 'button',
      on: { click: () => closeForm?.() },
    }, [h('span', { text: 'Cancelar' })])
    const saveBtn = h('button', {
      class: 'btn btn--primary',
      type: 'submit',
      form: NUEVA_INSCRIPCION_FORM_ID,
    }, [h('span', { text: 'Guardar inscripción' })])

    function onSubmit(event) {
      event.preventDefault()
      clearProblems()

      const problems = validate()
      if (problems.length > 0) {
        showProblems(problems)
        return
      }

      saveBtn.disabled = true
      saveBtn.replaceChildren(h('span', { text: 'Guardando…' }))

      const documentos = Object.fromEntries(
        documentoInputs.map(({ key, input }) => [key, input.checked]),
      )

      api
        .crearInscripcion(record.estudiante.id, {
          inscripcion: {
            anio: anioSelect.value,
            seccion: seccionSelect.value,
            anio_escolar: String(anioEscolar.value ?? '').trim(),
            fecha_inscripcion: parseLatamDate(fechaInscripcion.value),
            regular: regular.checked,
            repite: repite.checked,
          },
          documentos,
        })
        .then(() => {
          modal.close()
          // Refresh the list and reopen the ficha so the new inscription shows.
          load({ resetPage: true })
          openFicha(record.estudiante.id)
        })
        .catch((error) => {
          // A conflict is expected and has a message of its own: the year is
          // already registered for this student, not a generic failure.
          const message =
            error.status === 409
              ? 'Ya existe una inscripción para ese año escolar.'
              : errorCopy(error, 'No se pudo guardar la inscripción.')
          errorHost.replaceChildren(
            h('div', { class: 'alert alert--error', role: 'alert' }, [h('p', { text: message })]),
          )
          saveBtn.disabled = false
          saveBtn.replaceChildren(h('span', { text: 'Guardar inscripción' }))
        })
    }

    const form = h('form', {
      id: NUEVA_INSCRIPCION_FORM_ID,
      class: 'ficha-form',
      novalidate: true,
      on: { submit: onSubmit },
    }, [
      h('p', {
        class: 'ficha-form__hint',
        text: 'Inscribe al alumno en un nuevo año escolar. Sus datos personales y su representante no cambian.',
      }),
      errorHost,
      h('div', { class: 'ficha-form__grid' }, [
        editField('Año *', anioSelect),
        editField('Sección *', seccionSelect),
        editField('Año escolar *', anioEscolar),
        editField('Fecha de inscripción *', fechaInscripcion),
        h('div', { class: 'field field--full' }, [
          h('span', { class: 'field__label', text: 'Condición *' }),
          h('label', { class: 'inscripcion__check' }, [
            regular,
            h('span', { text: 'Regular (cambio de año)' }),
          ]),
          h('label', { class: 'inscripcion__check' }, [repite, h('span', { text: 'Repite el año' })]),
        ]),
        h('div', { class: 'field field--full' }, [
          h('span', { class: 'field__label', text: 'Documentos consignados' }),
          h('div', { class: 'inscripcion__docs' },
            documentoInputs.map(({ label, input }) =>
              h('label', { class: 'inscripcion__check' }, [input, h('span', { text: label })]),
            ),
          ),
        ]),
      ]),
    ])

    const modal = openModal({
      title: 'Inscribir en nuevo año',
      content: form,
      footer: [cancelBtn, saveBtn],
    })
    closeForm = modal.close
  }

  /**
   * Confirm before deleting. DELETE hard-deletes the student, cascades their
   * inscriptions and consigned documents, and sweeps the representatives left
   * with no student at all: there is nothing to undo afterwards.
   */
  function confirmDelete(student) {
    const name = `${student.primer_nombre} ${student.primer_apellido}`
    const errorHost = h('div', { class: 'ficha-form__errors' })

    let closeConfirm = null
    const cancelBtn = h('button', {
      class: 'btn btn--ghost',
      type: 'button',
      on: { click: () => closeConfirm?.() },
    }, [h('span', { text: 'Cancelar' })])
    const confirmBtn = h('button', { class: 'btn btn--danger', type: 'button' }, [
      h('span', { text: 'Borrar' }),
    ])

    const body = h('div', { class: 'confirm' }, [
      h('p', {
        class: 'confirm__question',
        text: `¿Borrar a ${name} (${student.tipo_ci}-${student.numero_ci})?`,
      }),
      h('p', {
        class: 'confirm__hint',
        text: 'Se borran también sus inscripciones, los documentos consignados y sus vínculos con representantes. No se puede deshacer.',
      }),
      errorHost,
    ])

    const modal = openModal({ title: 'Borrar estudiante', content: body, footer: [cancelBtn, confirmBtn] })
    closeConfirm = modal.close

    confirmBtn.addEventListener('click', () => {
      confirmBtn.disabled = true
      confirmBtn.replaceChildren(h('span', { text: 'Borrando…' }))

      api
        .eliminarEstudiante(student.id)
        .then(() => {
          modal.close()
          load()
        })
        .catch((error) => {
          errorHost.replaceChildren(
            h('div', { class: 'alert alert--error', role: 'alert' }, [
              h('p', { text: errorCopy(error, 'No se pudo borrar el estudiante.') }),
            ]),
          )
          confirmBtn.disabled = false
          confirmBtn.replaceChildren(h('span', { text: 'Borrar' }))
        })
    })
  }

  function load({ resetPage = false } = {}) {
    if (resetPage) {
      page = 1
    }
    const id = ++seq
    results.replaceChildren(h('p', { class: 'estudiantes__status', text: 'Cargando estudiantes…' }))
    api
      .estudiantes({
        q: qInput.value,
        anio: anioSelect.value,
        seccion: seccionSelect.value,
        page,
      })
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
    load({ resetPage: true })
  })
  seccionSelect.addEventListener('change', () => load({ resetPage: true }))

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