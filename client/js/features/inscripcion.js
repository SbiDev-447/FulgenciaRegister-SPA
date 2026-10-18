// Inscription feature: the "Nueva inscripción" wizard, painted by the view at
// `#/inscripcion` (S22). Collects the student data, their first inscription, the
// representatives (dynamic rows) and the consigned documents, mirrors the
// backend validators client-side and posts to POST /api/estudiantes. Markup is
// built with h() and textContent only (AGENTS/docs/ARQUITECTURA.md §6).

import { h, clear, autoSeparateDate } from '../ui/dom.js'
import {
  isValidEmail,
  isValidPhone,
  parseLatamDate,
  formatLatamDate,
  DATE_FIELD_LENGTH,
} from '../ui/format.js'
import { errorCopy } from '../ui/messages.js'
import { api } from '../api.js'
import { icon } from '../ui/icons.js'

/** Labels for the consigned-document keys, shared with the ficha view. */
export const DOC_LABELS = {
  partida_nacimiento: 'Partida de nacimiento',
  copia_cedula: 'Copia de cédula',
  boleta: 'Boleta',
  fotos: 'Fotos',
  carpeta: 'Carpeta',
  certificado_6to_grado: 'Certificado de 6to grado',
}

const CI_MAX_DIGITS = 12

/** Normalize human-formatted cédulas (`12.345.678`, spaces, dashes) to digits. */
function normalizeCi(value) {
  return String(value ?? '')
    .trim()
    .replace(/\D/g, '')
}

function localDateIso(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function field(label, input, { full = false } = {}) {
  return h('label', { class: full ? 'field field--full' : 'field' }, [
    h('span', { class: 'field__label', text: label }),
    input,
  ])
}

function textInput(props = {}) {
  return h('input', { class: 'input', type: 'text', ...props })
}

/**
 * Build the inscription wizard into `container`.
 * @param {HTMLElement} container - the view's mount point; it hosts the form and
 *   the wizard's own footer.
 * @param {{
 *   opciones: { years: Array<{ label: string, sections: string[] }> },
 *   onExit: () => void,
 * }} options - opciones comes from /api/academico/opciones; onExit runs when the
 *   user leaves the wizard, whether by cancelling or by saving successfully (the
 *   caller decides where that goes).
 */
export function renderInscripcionWizard(container, { opciones, onExit }) {
  const years = opciones?.years ?? []
  const now = new Date()
  const schoolYear = `${now.getFullYear()}-${now.getFullYear() + 1}`

  // --- Estudiante fields -----------------------------------------------------

  const tipoCi = h('select', { class: 'input', 'aria-label': 'Tipo de cédula' }, [
    h('option', { value: 'V', text: 'V' }),
    h('option', { value: 'E', text: 'E' }),
  ])
  const numeroCi = textInput({
    inputmode: 'numeric',
    placeholder: '12345678',
    'aria-label': 'Número de cédula del estudiante',
  })
  const primerNombre = textInput({ placeholder: 'Primer nombre' })
  const segundoNombre = textInput({ placeholder: 'Segundo nombre' })
  const primerApellido = textInput({ placeholder: 'Primer apellido' })
  const segundoApellido = textInput({ placeholder: 'Segundo apellido' })
  // Written dd/mm/aaaa on purpose: a native date picker shows the browser's
  // order, so the same date read differently from the ficha beside it.
  // `maxlength` fits `dd/mm/aaaa` exactly, and `autoSeparateDate` places the
  // slashes: the numeric keypad of a phone has no slash key of its own.
  const fechaNacimiento = h('input', {
    class: 'input',
    type: 'text',
    inputmode: 'numeric',
    placeholder: 'dd/mm/aaaa',
    maxlength: DATE_FIELD_LENGTH,
  })
  autoSeparateDate(fechaNacimiento)
  const sexo = h('select', { class: 'input' }, [
    h('option', { value: '', text: 'Selecciona…' }),
    h('option', { value: 'F', text: 'Femenino' }),
    h('option', { value: 'M', text: 'Masculino' }),
  ])
  const telefono = textInput({ inputmode: 'tel', placeholder: '0414-1234567' })
  const correo = h('input', { class: 'input', type: 'email', placeholder: 'correo@ejemplo.com' })
  const direccion = textInput({ placeholder: 'Sector, calle, casa…' })
  const paisNacimiento = textInput({ placeholder: 'Venezuela' })
  const estadoNacimiento = textInput({ placeholder: 'Estado' })
  const municipioNacimiento = textInput({ placeholder: 'Municipio' })
  const lateralidad = h('select', { class: 'input' }, [
    h('option', { value: '', text: 'Selecciona…' }),
    h('option', { value: 'Derecha', text: 'Derecha' }),
    h('option', { value: 'Izquierda', text: 'Izquierda' }),
    h('option', { value: 'Ambidiestro', text: 'Ambidiestro' }),
  ])
  const talla = textInput({ placeholder: 'cm' })
  const peso = textInput({ placeholder: 'kg' })
  const camisa = textInput({ placeholder: 'Ej: S, M, L…' })
  const pantalon = textInput({ placeholder: 'Ej: 30, 32…' })
  const zapatos = textInput({ placeholder: 'Ej: 34, 36…' })
  const alergicoA = textInput({ placeholder: 'Alimentos, medicamentos…' })
  const enfermedades = textInput({ placeholder: 'Cuales padece…' })

  // --- Inscripción fields ----------------------------------------------------

  const anioSelect = h('select', { class: 'input' }, [
    h('option', { value: '', text: 'Selecciona…' }),
    ...years.map((year) => h('option', { value: year.label, text: year.label })),
  ])
  const seccionSelect = h('select', { class: 'input', disabled: true }, [
    h('option', { value: '', text: 'Selecciona…' }),
  ])
  const anioEscolar = h('select', { class: 'input' }, [
    h('option', { value: `${now.getFullYear() - 1}-${now.getFullYear()}`, text: `${now.getFullYear() - 1}-${now.getFullYear()}` }),
    h('option', { value: schoolYear, text: schoolYear, selected: true }),
  ])
  const fechaInscripcion = h('input', {
    class: 'input',
    type: 'text',
    inputmode: 'numeric',
    placeholder: 'dd/mm/aaaa',
    maxlength: DATE_FIELD_LENGTH,
    value: formatLatamDate(localDateIso(now)),
  })
  autoSeparateDate(fechaInscripcion)
  // Mutually exclusive by domain: a regular registration is a new admission or
  // a promotion to the next year; the only alternative is repeating the year.
  // Native radios sharing a name make the pair exclusive, so the third
  // "neither" state cannot be produced from this form.
  const regular = h('input', { type: 'radio', name: 'tipo_inscripcion', checked: true })
  const repite = h('input', { type: 'radio', name: 'tipo_inscripcion' })

  anioSelect.addEventListener('change', () => {
    const year = years.find((entry) => entry.label === anioSelect.value)
    const sections = year ? year.sections : []
    seccionSelect.replaceChildren(
      h('option', { value: '', text: 'Selecciona…' }),
      ...sections.map((section) => h('option', { value: section, text: section })),
    )
    seccionSelect.disabled = sections.length === 0
  })

  // --- Representantes ----------------------------------------------------------

  const repsContainer = h('div', { class: 'inscripcion__reps' })

  function repRow() {
    const repNombre = textInput({ placeholder: 'Nombre y apellido' })
    const repTipoCi = h('select', { class: 'input', 'aria-label': 'Tipo de cédula del representante' }, [
      h('option', { value: 'V', text: 'V' }),
      h('option', { value: 'E', text: 'E' }),
    ])
    const repNumeroCi = textInput({ inputmode: 'numeric', placeholder: 'Cédula' })
    const repParentesco = textInput({ placeholder: 'Parentesco (Ej: Madre)' })
    const repTelefono = textInput({ inputmode: 'tel', placeholder: 'Teléfono' })
    const repCorreo = h('input', { class: 'input', type: 'email', placeholder: 'Correo' })

    const row = h('div', { class: 'inscripcion__rep' }, [
      field('Nombre y apellido *', repNombre),
      h('div', { class: 'inscripcion__ci' }, [
        field('Tipo', repTipoCi),
        field('Cédula *', repNumeroCi),
      ]),
      field('Parentesco', repParentesco),
      field('Teléfono *', repTelefono),
      field('Correo *', repCorreo),
      h('button', { class: 'btn btn--ghost inscripcion__rep-remove', type: 'button' }, [
        h('span', { text: 'Quitar' }),
      ]),
    ])

    row.querySelector('.inscripcion__rep-remove').addEventListener('click', () => {
      row.remove()
    })

    return { row, repNombre, repTipoCi, repNumeroCi, repParentesco, repTelefono, repCorreo }
  }

  const addRepButton = h('button', { class: 'btn btn--ghost', type: 'button' }, [
    icon('plus'),
    h('span', { text: 'Añadir representante' }),
  ])
  addRepButton.addEventListener('click', () => addRepButton.before(repRow().row))

  // --- Documentos ---------------------------------------------------------------

  const documentoInputs = Object.entries(DOC_LABELS).map(([key, label]) => {
    const input = h('input', { type: 'checkbox' })
    return { key, label, input }
  })

  // --- Form assembly ------------------------------------------------------------

  const errorBox = h('div', { class: 'alert alert--error inscripcion__error', role: 'alert', hidden: true })

  // A plain button on purpose, and it stays one. A browser runs a button's
  // activation behavior AFTER its click handlers, reading the button as it is by
  // then — so handing this one `type="submit"` while the wizard shows the last
  // step made arriving there submit the form by itself, error summary included.
  // Saving is asked for explicitly instead, in the click handler below.
  const submitBtn = h('button', {
    class: 'btn btn--primary',
    type: 'button',
    form: 'inscripcion-form',
  }, [h('span', { text: 'Siguiente' })])
  const cancelBtn = h('button', {
    class: 'btn btn--ghost',
    type: 'button',
    on: { click: () => onExit() },
  }, [h('span', { text: 'Cancelar' })])

  const documentosSection = h('section', { class: 'inscripcion__section' }, [
    h('h3', { class: 'inscripcion__section-title', text: 'Documentos consignados' }),
    h('p', {
      class: 'inscripcion__hint',
      text: 'Los seis documentos son obligatorios para inscribir al alumno.',
    }),
    h('div', { class: 'inscripcion__docs' },
      documentoInputs.map(({ label, input }) =>
        h('label', { class: 'inscripcion__check' }, [input, h('span', { text: label })]),
      ),
    ),
  ])

  const form = h('form', { id: 'inscripcion-form', class: 'inscripcion', novalidate: true, on: { submit: onSubmit } }, [
    errorBox,
    h('section', { class: 'inscripcion__section' }, [
      h('h3', { class: 'inscripcion__section-title', text: 'Datos del estudiante' }),
      h('div', { class: 'inscripcion__grid' }, [
        field('Cédula *', h('div', { class: 'inscripcion__ci' }, [tipoCi, numeroCi])),
        field('Primer nombre *', primerNombre),
        field('Segundo nombre *', segundoNombre),
        field('Primer apellido *', primerApellido),
        field('Segundo apellido *', segundoApellido),
        field('Fecha de nacimiento *', fechaNacimiento),
        field('Sexo *', sexo),
        field('Teléfono *', telefono),
        field('Correo *', correo),
        field('País de nacimiento *', paisNacimiento),
        field('Estado de nacimiento *', estadoNacimiento),
        field('Municipio de nacimiento *', municipioNacimiento),
        field('Lateralidad *', lateralidad),
        field('Talla (cm)', talla),
        field('Peso (kg)', peso),
        field('Camisa', camisa),
        field('Pantalón', pantalon),
        field('Zapatos', zapatos),
        field('Alérgico a', alergicoA),
        field('Enfermedades padecidas', enfermedades, { full: true }),
        field('Dirección de habitación', direccion, { full: true }),
      ]),
    ]),
    h('section', { class: 'inscripcion__section' }, [
      h('h3', { class: 'inscripcion__section-title', text: 'Inscripción' }),
      h('div', { class: 'inscripcion__grid' }, [
        field('Año *', anioSelect),
        field('Sección *', seccionSelect),
        field('Año escolar *', anioEscolar),
        field('Fecha de inscripción *', fechaInscripcion),
        h('label', { class: 'inscripcion__check' }, [
          regular,
          h('span', { text: 'Regular (nuevo ingreso o cambio de año)' }),
        ]),
        h('label', { class: 'inscripcion__check' }, [repite, h('span', { text: 'Repite el año' })]),
      ]),
    ]),
    h('section', { class: 'inscripcion__section' }, [
      h('h3', { class: 'inscripcion__section-title', text: 'Representantes' }),
      repsContainer,
      addRepButton,
    ]),
    documentosSection,
  ])

  // --- Wizard -------------------------------------------------------------------
  // One step per form section, showing only the step the user is standing on.
  // Advancing checks that step alone; saving — or a rejection coming from the
  // API — jumps back to the step that owns the first marked control.

  const STEP_TITLES = ['Datos del estudiante', 'Inscripción', 'Representantes', 'Documentos']
  const steps = Array.from(form.querySelectorAll('.inscripcion__section'))
  const stepItems = steps.map((_section, index) =>
    h('li', { class: 'inscripcion__step' }, [
      h('button', { class: 'inscripcion__step-btn', type: 'button' }, [
        h('span', { class: 'inscripcion__step-num', text: String(index + 1) }),
        h('span', { class: 'inscripcion__step-label', text: STEP_TITLES[index] }),
      ]),
    ]),
  )
  const backBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, [
    h('span', { text: 'Atrás' }),
  ])
  form.prepend(h('ol', { class: 'inscripcion__steps' }, stepItems))

  // The wizard is the page now, so it carries its own action bar: the footer
  // used to belong to the modal that hosted the form. The buttons stay outside
  // the form; `form` keeps them associated with it for assistive tech, and the
  // save button asks the form to submit through it explicitly.
  const footer = h('footer', { class: 'inscripcion__footer' }, [cancelBtn, backBtn, submitBtn])

  /** Place the reps toolbar inside the reps section (append after rows). */
  repsContainer.append(repRow().row, addRepButton)

  clear(container)
  container.append(form, footer)

  let currentStep = 0

  /** The step an error entry belongs to, resolved from its host or its first control. */
  function stepIndexOf(error) {
    const anchor = error.host ?? error.nodes[0]
    return steps.indexOf(anchor?.closest?.('.inscripcion__section'))
  }

  /** Show one step and keep the stepper and the nav buttons in sync with it. */
  function showStep(index) {
    currentStep = Math.min(Math.max(index, 0), steps.length - 1)
    steps.forEach((section, i) => {
      section.hidden = i !== currentStep
    })
    stepItems.forEach((item, i) => {
      const button = item.querySelector('button')
      // Only steps already left behind are reachable again.
      button.disabled = i > currentStep
      item.classList.toggle('is-current', i === currentStep)
      item.classList.toggle('is-done', i < currentStep)
      if (i === currentStep) {
        item.setAttribute('aria-current', 'step')
      } else {
        item.removeAttribute('aria-current')
      }
    })
    backBtn.hidden = currentStep === 0
    const isLast = currentStep === steps.length - 1
    // Only the wording changes; the type never does (see the click handler).
    submitBtn.replaceChildren(h('span', { text: isLast ? 'Guardar inscripción' : 'Siguiente' }))
    // The page keeps its scroll offset, so a new step would open half-way down
    // past the stepper the user needs to see.
    window.scrollTo(0, 0)
  }

  /** Advance one step, but only when the current one has nothing to complain about. */
  function nextStep() {
    // An error with no resolvable step is kept: never drop a problem silently.
    const errors = validate().filter(
      (error) => stepIndexOf(error) === currentStep || stepIndexOf(error) === -1,
    )
    if (errors.length > 0) {
      setError(errors)
      markFieldErrors(errors)
      focusFirstError(errors)
      return
    }
    setError([])
    clearFieldErrors()
    showStep(currentStep + 1)
  }

  stepItems.forEach((item, index) => {
    item.querySelector('button').addEventListener('click', () => {
      if (index < currentStep) showStep(index)
    })
  })
  backBtn.addEventListener('click', () => showStep(currentStep - 1))
  submitBtn.addEventListener('click', () => {
    // On the last step this saves; before that it only advances. The saving is
    // this call and not the button's type, so nothing is ever submitted by the
    // mere act of walking the wizard to its end.
    if (currentStep === steps.length - 1) {
      return form.requestSubmit()
    }
    return nextStep()
  })

  showStep(0)

  /** Where the red mark is actually visible for a given control. */
  function markTarget(node) {
    return node.matches('input[type="checkbox"], input[type="radio"]')
      ? node.closest('label') ?? node
      : node
  }

  /**
   * Show the summary box. Accepts validation errors (each tied to its control)
   * or plain messages coming from the API.
   */
  function setError(errors, { title = 'Revisa los campos marcados:' } = {}) {
    const messages = errors.map((entry) => (typeof entry === 'string' ? entry : entry.message))
    if (messages.length === 0) {
      errorBox.hidden = true
      errorBox.replaceChildren()
      return
    }
    errorBox.replaceChildren(
      h('p', { text: title }),
      h('ul', {}, messages.map((message) => h('li', { text: message }))),
    )
    errorBox.hidden = false
  }

  function clearFieldErrors() {
    form.querySelectorAll('.input-error').forEach((node) => node.classList.remove('input-error'))
    form.querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'))
    form.querySelectorAll('.field__error').forEach((node) => node.remove())
  }

  /** Paint every validation error next to the control it belongs to. */
  function markFieldErrors(errors) {
    clearFieldErrors()
    for (const { nodes, message, host } of errors) {
      for (const node of nodes) {
        if (node.matches('input, select, textarea')) node.setAttribute('aria-invalid', 'true')
        markTarget(node).classList.add('input-error')
      }
      const anchor = nodes[0]
      const target = host ?? anchor?.closest('.field') ?? anchor?.parentElement
      target?.append(h('span', { class: 'field__error', text: message }))
    }
  }

  /**
   * The panel scrolls internally, so an error rendered above the fold is
   * invisible: bring the first offending control into view instead of leaving
   * the user hunting for it.
   */
  function focusFirstError(errors) {
    const target = errors.flatMap(({ nodes }) => nodes)[0]
    if (!target) {
      errorBox.scrollIntoView({ block: 'nearest' })
      return
    }
    target.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
    target.focus({ preventScroll: true })
  }

  /** Drop the mark of a control the user just fixed, and any message it left behind. */
  function onControlEdit(event) {
    const node = event.target
    if (!node) return
    const marked = markTarget(node)
    if (!marked.classList.contains('input-error')) return
    marked.classList.remove('input-error')
    if (node.matches('input, select, textarea')) node.removeAttribute('aria-invalid')
    form.querySelectorAll('.field__error').forEach((message) => {
      if (!message.parentElement?.querySelector('.input-error')) message.remove()
    })
    if (!form.querySelector('.input-error')) setError([])
  }

  form.addEventListener('input', onControlEdit)
  form.addEventListener('change', onControlEdit)

  // --- API rejections ---------------------------------------------------------

  /** Server `details` keys -> the controls that own them. */
  const serverFieldNodes = {
    tipo_ci: () => [tipoCi],
    numero_ci: () => [numeroCi],
    primer_nombre: () => [primerNombre],
    primer_apellido: () => [primerApellido],
    fecha_nacimiento: () => [fechaNacimiento],
    sexo: () => [sexo],
    segundo_nombre: () => [segundoNombre],
    segundo_apellido: () => [segundoApellido],
    telefono: () => [telefono],
    correo: () => [correo],
    pais_nacimiento: () => [paisNacimiento],
    estado_nacimiento: () => [estadoNacimiento],
    municipio_nacimiento: () => [municipioNacimiento],
    lateralidad: () => [lateralidad],
    talla: () => [talla],
    peso: () => [peso],
    camisa: () => [camisa],
    pantalon: () => [pantalon],
    zapatos: () => [zapatos],
    direccion_habitacion: () => [direccion],
    alergico_a: () => [alergicoA],
    enfermedades_padecidas: () => [enfermedades],
    anio: () => [anioSelect],
    seccion: () => [seccionSelect],
    anio_escolar: () => [anioEscolar],
    fecha_inscripcion: () => [fechaInscripcion],
    documentos: () => documentoInputs.filter(({ input }) => !input.checked).map(({ input }) => input),
  }

  /** Spanish name of each server field, for the per-field message. */
  const serverFieldLabels = {
    tipo_ci: 'Tipo de cédula',
    numero_ci: 'Cédula',
    primer_nombre: 'Primer nombre',
    primer_apellido: 'Primer apellido',
    fecha_nacimiento: 'Fecha de nacimiento',
    sexo: 'Sexo',
    segundo_nombre: 'Segundo nombre',
    segundo_apellido: 'Segundo apellido',
    telefono: 'Teléfono',
    correo: 'Correo',
    pais_nacimiento: 'País de nacimiento',
    estado_nacimiento: 'Estado de nacimiento',
    municipio_nacimiento: 'Municipio de nacimiento',
    lateralidad: 'Lateralidad',
    talla: 'Talla',
    peso: 'Peso',
    camisa: 'Camisa',
    pantalon: 'Pantalón',
    zapatos: 'Zapatos',
    direccion_habitacion: 'Dirección de habitación',
    alergico_a: 'Alérgico a',
    enfermedades_padecidas: 'Enfermedades padecidas',
    anio: 'Año',
    seccion: 'Sección',
    anio_escolar: 'Año escolar',
    fecha_inscripcion: 'Fecha de inscripción',
    documentos: 'Documentos consignados',
  }

  /** The server validates in English; translate the reasons it can send. */
  const serverReasons = {
    'is required': 'es obligatorio.',
    'must be V or E': 'debe ser V o E.',
    'must be 1-12 digits': 'debe tener entre 1 y 12 dígitos.',
    'must be a valid YYYY-MM-DD date': 'debe ser una fecha válida (AAAA-MM-DD).',
    'must be M or F': 'debe ser M o F.',
    'must match YYYY-YYYY': 'debe tener la forma AAAA-AAAA.',
    'must be a known year label': 'no es un año conocido.',
    'must be a boolean': 'debe ser verdadero o falso.',
    'must be a positive integer': 'debe ser un entero positivo.',
    'invalid section for the year': 'no corresponde a ese año.',
    // The API answers 400 when a value does not fit the column the database
    // stores it in (too long, out of range, wrong type) — the field is named by
    // the driver itself, so these names have to exist here or the person reads
    // the raw English reason.
    'is too long': 'es demasiado largo.',
    'is out of range': 'está fuera de rango.',
    'is invalid': 'no es válido.',
  }

  /**
   * Turn an API rejection into the same shape local validation produces, so the
   * user is taken to the offending field instead of reading a text list. Keys
   * with no control in this form (docente_id, regular/repite, the individual
   * document flags, the representative indexes) stay as summary lines.
   */
  function serverErrors(error) {
    if (!error) return { fieldErrors: [], messages: [] }

    // Every 400 the server can raise is already blocked by validate(), so a 409
    // is the rejection a user can actually hit here: the (tipo_ci, numero_ci)
    // pair already exists. Representatives are reused by CI, so the conflict is
    // the student's pair.
    if (error.status === 409) {
      const message = 'La cédula del estudiante ya está registrada.'
      return { fieldErrors: [{ nodes: [numeroCi], message }], messages: [message] }
    }

    const fieldErrors = []
    const messages = []
    for (const [key, value] of Object.entries(error.details ?? {})) {
      const nodes = serverFieldNodes[key]?.() ?? []
      const reason = serverReasons[value] ?? value
      const text = serverFieldLabels[key] ? `${serverFieldLabels[key]} ${reason}` : `${key}: ${reason}`
      if (nodes.length > 0) {
        fieldErrors.push({ nodes, message: text, host: key === 'documentos' ? documentosSection : undefined })
      }
      messages.push(text)
    }
    return { fieldErrors, messages }
  }

  /**
   * Validate the form and tie every problem to the control that caused it, so
   * the UI can mark it and jump to it.
   * @returns {Array<{ nodes: HTMLElement[], message: string, host?: HTMLElement }>}
   */
  function validate() {
    const errors = []
    const add = (nodes, message, host) =>
      errors.push({ nodes: nodes.filter(Boolean), message, host })

    const estudianteCi = normalizeCi(numeroCi.value)
    if (!estudianteCi || estudianteCi.length > CI_MAX_DIGITS) {
      add([numeroCi], 'La cédula del estudiante debe tener entre 1 y 12 dígitos.')
    }
    if (!primerNombre.value.trim()) add([primerNombre], 'Falta el primer nombre del estudiante.')
    if (!primerApellido.value.trim()) add([primerApellido], 'Falta el primer apellido del estudiante.')
    if (!fechaNacimiento.value.trim()) {
      add([fechaNacimiento], 'Falta la fecha de nacimiento.')
    } else if (!parseLatamDate(fechaNacimiento.value)) {
      // A text field no longer rejects this by itself the way a date picker did.
      add([fechaNacimiento], 'La fecha de nacimiento debe tener la forma dd/mm/aaaa (ej: 04/03/2010).')
    }
    if (!sexo.value) add([sexo], 'Selecciona el sexo del estudiante.')
    if (!segundoNombre.value.trim()) add([segundoNombre], 'Falta el segundo nombre del estudiante.')
    if (!segundoApellido.value.trim()) add([segundoApellido], 'Falta el segundo apellido del estudiante.')
    if (!telefono.value.trim()) {
      add([telefono], 'Falta el teléfono del estudiante.')
    } else if (!isValidPhone(telefono.value)) {
      add([telefono], 'El teléfono del estudiante no tiene un formato válido.')
    }
    if (!correo.value.trim()) {
      add([correo], 'Falta el correo del estudiante.')
    } else if (!isValidEmail(correo.value)) {
      add([correo], 'El correo del estudiante no tiene un formato válido.')
    }
    if (!paisNacimiento.value.trim()) add([paisNacimiento], 'Falta el país de nacimiento.')
    if (!estadoNacimiento.value.trim()) add([estadoNacimiento], 'Falta el estado de nacimiento.')
    if (!municipioNacimiento.value.trim()) add([municipioNacimiento], 'Falta el municipio de nacimiento.')
    if (!lateralidad.value) add([lateralidad], 'Selecciona la lateralidad del estudiante.')
    if (!anioSelect.value) {
      add([anioSelect], 'Selecciona el año de inscripción.')
    } else if (!seccionSelect.value) {
      add([seccionSelect], `Selecciona la sección para ${anioSelect.value}.`)
    }
    if (!anioEscolar.value || !/^\d{4}-\d{4}$/.test(anioEscolar.value)) {
      add([anioEscolar], 'El año escolar debe tener la forma YYYY-YYYY.')
    }
    if (!fechaInscripcion.value.trim()) {
      add([fechaInscripcion], 'Falta la fecha de inscripción.')
    } else if (!parseLatamDate(fechaInscripcion.value)) {
      add([fechaInscripcion], 'La fecha de inscripción debe tener la forma dd/mm/aaaa (ej: 04/03/2010).')
    }

    const faltantes = documentoInputs.filter(({ input }) => !input.checked)
    if (faltantes.length > 0) {
      add(
        faltantes.map(({ input }) => input),
        `Todos los documentos son obligatorios para inscribir: falta ${faltantes
          .map(({ label }) => label)
          .join(', ')}.`,
        documentosSection,
      )
    }

    const repInputs = Array.from(repsContainer.querySelectorAll('.inscripcion__rep')).map((row) => ({
      nombreEl: row.querySelector('input[placeholder="Nombre y apellido"]'),
      ciEl: row.querySelector('.inscripcion__ci input'),
      telefonoEl: row.querySelector('input[placeholder="Teléfono"]'),
      correoEl: row.querySelector('input[placeholder="Correo"]'),
      nombre: row.querySelector('input[placeholder="Nombre y apellido"]')?.value ?? '',
      tipoCi: row.querySelector('.inscripcion__ci select')?.value ?? '',
      numeroCi: normalizeCi(row.querySelector('.inscripcion__ci input')?.value ?? ''),
      telefono: row.querySelector('input[placeholder="Teléfono"]')?.value ?? '',
      correo: row.querySelector('input[placeholder="Correo"]')?.value ?? '',
    }))

    if (repInputs.length === 0) {
      add([], 'Registra al menos un representante.', repsContainer)
    }
    const seenCis = new Set()
    repInputs.forEach((rep, index) => {
      if (!rep.nombre.trim()) {
        add([rep.nombreEl], `Falta el nombre del representante ${index + 1}.`)
      }
      if (!rep.numeroCi || rep.numeroCi.length > CI_MAX_DIGITS) {
        add([rep.ciEl], `La cédula del representante ${index + 1} debe tener entre 1 y 12 dígitos.`)
      }
      if (!rep.telefono.trim()) {
        add([rep.telefonoEl], `Falta el teléfono del representante ${index + 1}.`)
      } else if (!isValidPhone(rep.telefono)) {
        add([rep.telefonoEl], `El teléfono del representante ${index + 1} no tiene un formato válido.`)
      }
      if (!rep.correo.trim()) {
        add([rep.correoEl], `Falta el correo del representante ${index + 1}.`)
      } else if (!isValidEmail(rep.correo)) {
        add([rep.correoEl], `El correo del representante ${index + 1} no tiene un formato válido.`)
      }
      const ciKey = `${rep.tipoCi}-${rep.numeroCi}`
      if (rep.numeroCi && seenCis.has(ciKey)) {
        add([rep.ciEl], `La cédula ${ciKey} está repetida entre los representantes.`)
      }
      if (rep.numeroCi) seenCis.add(ciKey)
    })

    return errors
  }

  function collectPayload() {
    const estudiante = {
      tipo_ci: tipoCi.value,
      numero_ci: normalizeCi(numeroCi.value),
      primer_nombre: primerNombre.value.trim(),
      segundo_nombre: segundoNombre.value.trim() || undefined,
      primer_apellido: primerApellido.value.trim(),
      segundo_apellido: segundoApellido.value.trim() || undefined,
      fecha_nacimiento: parseLatamDate(fechaNacimiento.value),
      sexo: sexo.value,
      telefono: telefono.value.trim() || undefined,
      correo: correo.value.trim() || undefined,
      direccion_habitacion: direccion.value.trim() || undefined,
      pais_nacimiento: paisNacimiento.value.trim() || undefined,
      estado_nacimiento: estadoNacimiento.value.trim() || undefined,
      municipio_nacimiento: municipioNacimiento.value.trim() || undefined,
      lateralidad: lateralidad.value || undefined,
      talla: talla.value.trim() || undefined,
      peso: peso.value.trim() || undefined,
      camisa: camisa.value.trim() || undefined,
      pantalon: pantalon.value.trim() || undefined,
      zapatos: zapatos.value.trim() || undefined,
      alergico_a: alergicoA.value.trim() || undefined,
      enfermedades_padecidas: enfermedades.value.trim() || undefined,
    }

    const representantes = Array.from(repsContainer.querySelectorAll('.inscripcion__rep')).map((row) => ({
      nombre: row.querySelector('input[placeholder="Nombre y apellido"]').value.trim(),
      tipo_ci: row.querySelector('.inscripcion__ci select').value,
      numero_ci: normalizeCi(row.querySelector('.inscripcion__ci input').value),
      parentesco: row.querySelector('input[placeholder="Parentesco (Ej: Madre)"]').value.trim() || undefined,
      telefono: row.querySelector('input[placeholder="Teléfono"]').value.trim() || undefined,
      correo: row.querySelector('input[placeholder="Correo"]').value.trim() || undefined,
    }))

    const documentos = Object.fromEntries(
      documentoInputs.map(({ key, input }) => [key, input.checked]),
    )

    return {
      estudiante,
      inscripcion: {
        anio: anioSelect.value,
        seccion: seccionSelect.value,
        anio_escolar: anioEscolar.value,
        fecha_inscripcion: parseLatamDate(fechaInscripcion.value),
        regular: regular.checked,
        repite: repite.checked,
      },
      representantes,
      documentos,
    }
  }

  function onSubmit(event) {
    event.preventDefault()
    const errors = validate()
    if (errors.length > 0) {
      // The wizard shows one step at a time: land on the step of the first
      // problem before marking and focusing it, or the mark is invisible.
      const owner = stepIndexOf(errors[0])
      if (owner >= 0) showStep(owner)
      setError(errors)
      markFieldErrors(errors)
      focusFirstError(errors)
      return
    }
    setError([])
    clearFieldErrors()

    submitBtn.disabled = true
    submitBtn.replaceChildren(h('span', { text: 'Guardando…' }))

    api
      .crearEstudiante(collectPayload())
      .then(() => {
        onExit()
      })
      .catch((error) => {
        const { fieldErrors, messages } = serverErrors(error)
        const fallback = errorCopy(error, 'No se pudo guardar la inscripción.')
        const owner = fieldErrors.map(stepIndexOf).find((index) => index >= 0)
        // The jump goes first, like the local path: marks become visible only on
        // the step that is shown.
        if (owner !== undefined) showStep(owner)
        setError(messages.length > 0 ? messages : [fallback], { title: 'No se pudo guardar:' })
        markFieldErrors(fieldErrors)
        submitBtn.disabled = false
        // showStep owns the label, so only restore it when the wizard stayed on
        // the step that saves; a jump to step 1-3 relabelled it "Siguiente", and
        // calling it "Guardar inscripción" again would promise a save a click
        // no longer performs.
        if (currentStep === steps.length - 1) {
          submitBtn.replaceChildren(h('span', { text: 'Guardar inscripción' }))
        }
        if (owner !== undefined) {
          focusFirstError(fieldErrors)
        } else {
          // Nothing to focus inside a step (an unmapped field, or a general
          // rejection): the summary at the top of the form carries the reason.
          errorBox.scrollIntoView({ block: 'nearest' })
        }
      })
  }
}