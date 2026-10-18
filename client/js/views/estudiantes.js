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
  DATE_FIELD_LENGTH,
} from '../ui/format.js'
import { api } from '../api.js'
import { icon } from '../ui/icons.js'
import { openModal } from '../ui/modal.js'
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
    // The inscription form is a page of its own (S22): navigate to it rather
    // than opening a popup, so the browser's back button works and the form gets
    // the full width.
    window.location.hash = '/inscripcion'
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
      on: {
        click: (event) => {
          event.stopPropagation()
          onClick()
        },
      },
    }, [h('span', { text: label })])
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
    const errorHost = h('div', { class: 'ficha-form__errors' })
    const controls = new Map()

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

    const grid = h('div', { class: 'ficha-form__grid' }, [
      editField('Cédula', h('div', { class: 'ficha-form__ci' }, [ciType, ciNumber]), { full: true }),
      ...EDIT_FIELDS.map((field) => {
        const control = editControl(field, estudiante[field.name])
        controls.set(field.name, control)
        return editField(field.label, control, { full: field.full })
      }),
    ])

    function clearProblems() {
      errorHost.replaceChildren()
      for (const control of controls.values()) {
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
      return { estudiante: patch }
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
        text: 'La cédula identifica al estudiante y no se puede cambiar. Las inscripciones, los representantes y los documentos se gestionan en sus propias pantallas.',
      }),
      errorHost,
      grid,
    ])
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