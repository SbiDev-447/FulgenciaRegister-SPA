// Estudiantes view: the row actions (Ver / Editar / Borrar) and the edit form.
//
// Every case here was pinned against the real API before being written, because
// the contract has traps a unit test alone would not reveal:
//   - `peso` is decimal(5,2): sending "" is a 500, so clearing it must send null;
//   - a validated field (telefono, correo, names...) rejects "" with a 400, so
//     the form keeps them required and never blanks them;
//   - the cédula pair is immutable server-side (400 when it changes), so the
//     form never sends it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { installDom, makeEl, findAll, textOf, dispatch, respondWith, stallFetch } from './dom-stub.mjs'

installDom()

const OPCIONES = { years: [{ label: '1er Año', sections: ['A', 'B'] }] }

/** One row of the list (GET /estudiantes) — the shape the server really returns. */
const ROW = {
  id: 7,
  tipo_ci: 'V',
  numero_ci: '12345678',
  primer_nombre: 'María',
  primer_apellido: 'Pérez',
  sexo: 'F',
  telefono: '0414-1234567',
  anio: '1er Año',
  seccion: 'A',
  anio_escolar: '2026-2027',
}

/** The full record (GET /estudiantes/:id) the edit form is filled from. */
const RECORD = {
  estudiante: {
    ...ROW,
    segundo_nombre: 'José',
    segundo_apellido: 'Gómez',
    // The API returns datetimes, not plain dates (verified against it): the form
    // has to trim this to the date part or input[type=date] rejects it.
    fecha_nacimiento: '2010-03-04T04:30:00.000Z',
    correo: 'maria@ejemplo.com',
    pais_nacimiento: 'Venezuela',
    estado_nacimiento: 'Trujillo',
    municipio_nacimiento: 'Miranda',
    lateralidad: 'Derecha',
    talla: '160',
    peso: '55.20',
    camisa: 'S',
    pantalon: '28',
    zapatos: '36',
    direccion_habitacion: 'Calle 1, casa 2',
    alergico_a: 'Ninguna',
    enfermedades_padecidas: 'Ninguna',
  },
  inscripciones: [
    {
      anio: '1er Año',
      seccion: 'A',
      anio_escolar: '2026-2027',
      fecha_inscripcion: '2026-09-15T04:30:00.000Z',
      repite: false,
      documentos: {
        partida_nacimiento: true,
        copia_cedula: true,
        boleta: false,
        fotos: true,
        carpeta: false,
        certificado_6to_grado: false,
      },
    },
  ],
  representantes: [
    {
      id: 55,
      nombre: 'Ana Gómez',
      parentesco: 'Madre',
      tipo_ci: 'V',
      numero_ci: '87654321',
      telefono: '0414-9998877',
      correo: 'ana@ejemplo.com',
    },
  ],
}

/** Every request the view made, in order. */
let calls = []

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) }
}

/** Answer the three endpoints this view talks to, recording every call. */
function apiStub() {
  return async (url, options = {}) => {
    const method = options.method ?? 'GET'
    calls.push({ url, method, body: options.body ? JSON.parse(options.body) : null })

    if (url.includes('/academico/opciones')) return jsonResponse(OPCIONES)
    if (/\/estudiantes\/\d+/.test(url)) {
      if (method === 'PUT') return jsonResponse(RECORD)
      if (method === 'DELETE') return jsonResponse({ ok: true })
      return jsonResponse(RECORD)
    }
    if (url.includes('/estudiantes')) return jsonResponse({ estudiantes: [ROW] })
    return jsonResponse({}, 404)
  }
}

/** Let the view's fetch → then() chains settle. */
async function flush(times = 5) {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

/** Modals live on document.body and outlive a test; start each one clean. */
function resetBody() {
  document.body.replaceChildren()
  calls = []
}

async function mountList() {
  const { renderEstudiantes } = await import('../js/views/estudiantes.js')
  const container = makeEl('div')
  renderEstudiantes(container, { user: {} })
  await flush()
  return container
}

function rowActions(container) {
  return findAll(container, '.estudiantes__actions .btn')
}

function inputNamed(root, name) {
  return findAll(root, `input[name="${name}"]`)[0]
}

function controlNamed(root, name) {
  return findAll(root, `[name="${name}"]`)[0]
}

test('every row offers Ver, Editar and Borrar as icon-only buttons', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    const actions = rowActions(container)
    assert.equal(actions.length, 3, 'the row is missing one of the three actions the spec asks for')

    const expected = [
      { label: 'Ver', title: 'Ver' },
      { label: 'Editar', title: 'Editar' },
      { label: 'Borrar', title: 'Borrar' },
    ]
    actions.forEach((button, index) => {
      const { label, title } = expected[index]
      assert.equal(button.getAttribute('aria-label'), `${label}: María Pérez`)
      assert.equal(button.getAttribute('title'), title)
      assert.equal(findAll(button, 'svg').length, 1, `${label} must render an SVG icon`)
      assert.equal(textOf(button), '', `${label} must not show visible text`)
    })
  } finally {
    stallFetch()
  }
})

test('Editar opens a form pre-filled from the full record', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[1], 'click')
    await flush()

    const modal = findAll(document.body, '.modal')[0]
    assert.ok(modal, 'Editar must open a modal')
    const form = findAll(modal, 'form')[0]
    assert.ok(form, 'the modal must host the edit form')

    assert.equal(inputNamed(form, 'primer_nombre')?.value, 'María')
    assert.equal(inputNamed(form, 'telefono')?.value, '0414-1234567')
    assert.equal(inputNamed(form, 'correo')?.value, 'maria@ejemplo.com')
    assert.equal(inputNamed(form, 'peso')?.value, '55.20')
    // The stored datetime lands in the field as a written Latin American date.
    // The field is a text input, not `type="date"`: the native control's shown
    // order follows the browser's locale (MDN), so the same birth date read
    // 03/04 or 04/03 depending on who opened the app.
    assert.equal(inputNamed(form, 'fecha_nacimiento')?.value, '04/03/2010')
    // The form is filled from GET /estudiantes/:id, not from the summary row:
    // only the full record carries the address and the birth date.
    assert.equal(inputNamed(form, 'direccion_habitacion')?.value, 'Calle 1, casa 2')
  } finally {
    stallFetch()
  }
})

test('the cédula is shown read-only and never travels in the payload', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[1], 'click')
    await flush()

    const form = findAll(document.body, '.modal')[0] && findAll(findAll(document.body, '.modal')[0], 'form')[0]
    const numeroCi = inputNamed(form, 'numero_ci')
    const tipoCi = findAll(form, 'select[name="tipo_ci"]')[0]
    assert.ok(numeroCi, 'the cédula must stay visible on the form')
    assert.ok(
      numeroCi.hasAttribute('readonly') || numeroCi.hasAttribute('disabled'),
      'the cédula number is immutable: it must not be editable',
    )
    assert.ok(tipoCi, 'the cédula type must stay visible')
    assert.ok(
      tipoCi.hasAttribute('disabled'),
      'the cédula type is immutable: it must look and act locked',
    )

    await dispatch(form, 'submit')
    await flush()

    const put = calls.find((call) => call.method === 'PUT')
    assert.ok(put, 'saving must send a PUT')
    assert.equal(put.body.estudiante.tipo_ci, undefined, 'tipo_ci must not be sent')
    assert.equal(put.body.estudiante.numero_ci, undefined, 'numero_ci must not be sent')
  } finally {
    stallFetch()
  }
})

test('editing the representative sends its id so the shared person is updated', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[1], 'click')
    await flush()

    const form = findAll(findAll(document.body, '.modal')[0], 'form')[0]
    assert.equal(inputNamed(form, 'representante_nombre').value, 'Ana Gómez')
    assert.equal(inputNamed(form, 'representante_numero_ci').value, '87654321')
    assert.equal(inputNamed(form, 'representante_parentesco').value, 'Madre')

    const repName = inputNamed(form, 'representante_nombre')
    const repEmail = inputNamed(form, 'representante_correo')
    const repParentesco = inputNamed(form, 'representante_parentesco')
    repName.value = 'Ana Actualizada'
    repEmail.value = 'ana.nueva@ejemplo.com'
    repParentesco.value = 'Tía'
    await dispatch(repName, 'input')
    await dispatch(repEmail, 'input')
    await dispatch(repParentesco, 'input')
    await dispatch(form, 'submit')
    await flush()

    const put = calls.find((call) => call.method === 'PUT')
    assert.ok(put, 'saving must send a PUT')
    assert.equal(put.body.representantes.length, 1)
    assert.equal(put.body.representantes[0].id, 55, 'the id identifies the shared person')
    assert.equal(put.body.representantes[0].nombre, 'Ana Actualizada')
    assert.equal(put.body.representantes[0].correo, 'ana.nueva@ejemplo.com')
    assert.equal(put.body.representantes[0].parentesco, 'Tía')
    assert.equal(put.body.estudiante.representante_nombre, undefined, 'rep fields stay out of the student patch')
  } finally {
    stallFetch()
  }
})

test('saving sends a PUT with the edited fields and closes the modal', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[1], 'click')
    await flush()

    const form = findAll(document.body, '.modal')[0] && findAll(findAll(document.body, '.modal')[0], 'form')[0]
    inputNamed(form, 'telefono').value = '0424-9999999'
    inputNamed(form, 'primer_nombre').value = 'Mariana'

    await dispatch(form, 'submit')
    await flush()

    const put = calls.find((call) => call.method === 'PUT')
    assert.equal(put.url, '/api/estudiantes/7')
    assert.equal(put.body.estudiante.telefono, '0424-9999999')
    assert.equal(put.body.estudiante.primer_nombre, 'Mariana')
    // The field is written dd/mm/aaaa, but the API stores ISO: what was shown
    // as 04/03/2010 must travel as 2010-03-04.
    assert.equal(put.body.estudiante.fecha_nacimiento, '2010-03-04')
    // This slice edits the student's own record only.
    assert.equal(put.body.inscripcion, undefined, 'inscriptions are out of this slice')
    assert.equal(put.body.representantes.length, 1, 'the representative section travels unchanged')
    assert.equal(put.body.representantes[0].id, 55)

    assert.equal(findAll(document.body, '.modal').length, 0, 'the modal must close after saving')
    // The list is reloaded so the row shows the new data.
    const listGets = calls.filter((call) => call.method === 'GET' && call.url === '/api/estudiantes')
    assert.equal(listGets.length, 2, 'the list must be reloaded after saving')
  } finally {
    stallFetch()
  }
})

test('a comma in peso becomes a dot, and emptying peso sends null (never "")', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[1], 'click')
    await flush()

    const modal = findAll(document.body, '.modal')[0]
    const form = findAll(modal, 'form')[0]

    // A comma reached the API as a 500 against a decimal(5,2) column.
    inputNamed(form, 'peso').value = '55,5'
    await dispatch(form, 'submit')
    await flush()
    assert.equal(calls.find((call) => call.method === 'PUT').body.estudiante.peso, '55.5')

    // Emptying it sent "" and the API answered 500; null is what clears it.
    calls = []
    await dispatch(rowActions(container)[1], 'click')
    await flush()
    const secondForm = findAll(findAll(document.body, '.modal')[0], 'form')[0]
    inputNamed(secondForm, 'peso').value = ''
    await dispatch(secondForm, 'submit')
    await flush()
    assert.equal(calls.find((call) => call.method === 'PUT').body.estudiante.peso, null)
  } finally {
    stallFetch()
  }
})

test('an invalid form is flagged locally and never reaches the API', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[1], 'click')
    await flush()

    const modal = findAll(document.body, '.modal')[0]
    const form = findAll(modal, 'form')[0]
    inputNamed(form, 'primer_nombre').value = ''
    inputNamed(form, 'correo').value = 'no-es-un-correo'

    await dispatch(form, 'submit')
    await flush()

    assert.equal(calls.find((call) => call.method === 'PUT'), undefined, 'invalid data must not be sent')
    assert.ok(findAll(modal, '.alert')[0], 'the user must be told what is wrong')
    assert.equal(findAll(document.body, '.modal').length, 1, 'the modal stays open on a validation error')
  } finally {
    stallFetch()
  }
})

test('a date that does not exist is refused before reaching the API', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[1], 'click')
    await flush()

    const modal = findAll(document.body, '.modal')[0]
    const form = findAll(modal, 'form')[0]
    // A text field no longer protects us the way `type="date"` did: this has to
    // be caught here, because a naive parse would roll it over to March 3rd.
    inputNamed(form, 'fecha_nacimiento').value = '31/02/2010'

    await dispatch(form, 'submit')
    await flush()

    assert.equal(calls.find((call) => call.method === 'PUT'), undefined, 'an impossible date must not be sent')
    assert.ok(findAll(modal, '.alert')[0], 'the user must be told the date is wrong')
    assert.equal(findAll(document.body, '.modal').length, 1, 'the modal stays open on a validation error')
  } finally {
    stallFetch()
  }
})

test('the date field writes its own separators while you type', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[1], 'click')
    await flush()

    const form = findAll(findAll(document.body, '.modal')[0], 'form')[0]
    const fecha = inputNamed(form, 'fecha_nacimiento')

    // Typed left to right, eight digits: the slashes appear on their own. This is
    // the phone path, where the keypad has no slash key at all.
    const steps = [
      ['0', '0'],
      ['04', '04/'],
      ['04/1', '04/1'],
      ['04/12', '04/12/'],
      ['04/12/199', '04/12/199'],
      ['04/12/1999', '04/12/1999'],
    ]
    for (const [typed, expected] of steps) {
      fecha.value = typed
      await dispatch(fecha, 'input')
      assert.equal(fecha.value, expected, `after typing ${typed}`)
    }
    assert.equal(fecha.value, '04/12/1999')

    // And what was typed is what the API receives, in ISO.
    await dispatch(form, 'submit')
    await flush()
    assert.equal(
      calls.find((call) => call.method === 'PUT').body.estudiante.fecha_nacimiento,
      '1999-12-04',
    )
  } finally {
    stallFetch()
  }
})

test('backspace on the date field is never re-filled', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[1], 'click')
    await flush()

    const form = findAll(findAll(document.body, '.modal')[0], 'form')[0]
    const fecha = inputNamed(form, 'fecha_nacimiento')
    // The field arrives pre-filled with 04/03/2010. Deleting the separator is
    // exactly what a mask gets wrong: it puts the slash straight back and the
    // user cannot shorten the date.
    for (const value of ['04/03/201', '04/03', '04/', '04', '']) {
      fecha.value = value
      await dispatch(fecha, 'input')
      assert.equal(fecha.value, value, `after deleting to ${JSON.stringify(value)}`)
    }
  } finally {
    stallFetch()
  }
})

test('Borrar asks for confirmation and only deletes after confirming', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[2], 'click')
    await flush()

    const modal = findAll(document.body, '.modal')[0]
    assert.ok(modal, 'Borrar must ask for confirmation')
    assert.ok(
      textOf(modal).includes('María Pérez'),
      'the confirmation must name the student being deleted',
    )
    assert.equal(calls.find((call) => call.method === 'DELETE'), undefined, 'opening the dialog must not delete')

    const confirm = findAll(modal, '.modal__footer .btn').find((button) => textOf(button) === 'Borrar')
    assert.ok(confirm, 'the dialog is missing its Borrar button')
    await dispatch(confirm, 'click')
    await flush()

    const del = calls.find((call) => call.method === 'DELETE')
    assert.equal(del.url, '/api/estudiantes/7')
    assert.equal(findAll(document.body, '.modal').length, 0, 'the dialog must close after deleting')
    const listGets = calls.filter((call) => call.method === 'GET' && call.url === '/api/estudiantes')
    assert.equal(listGets.length, 2, 'the list must be reloaded after deleting')
  } finally {
    stallFetch()
  }
})

test('the ficha shows the birth date as dd/mm/yyyy, not a dash', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[0], 'click')
    await flush()

    const modal = findAll(document.body, '.modal')[0]
    assert.ok(modal, 'Ver must open the ficha')
    // The API answers `fecha_nacimiento: "2010-03-04T04:30:00.000Z"`. The old
    // formatter glued a time onto that string, got an Invalid Date and painted a
    // dash; the date must read the Latin American way instead.
    assert.ok(
      textOf(modal).includes('04/03/2010'),
      `the ficha must show dd/mm/yyyy, got: ${textOf(modal)}`,
    )
  } finally {
    stallFetch()
  }
})

test('Imprimir ficha builds a sheet from the loaded record and calls the printer', async () => {
  resetBody()
  respondWith(apiStub())
  let printed = 0
  try {
    const { renderEstudiantes } = await import('../js/views/estudiantes.js')
    const container = makeEl('div')
    renderEstudiantes(container, { print: () => { printed += 1 } })
    await flush()

    await dispatch(rowActions(container)[0], 'click')
    await flush()

    const modal = findAll(document.body, '.modal')[0]
    const printButton = findAll(modal, '.modal__footer .btn').find(
      (button) => textOf(button) === 'Imprimir ficha',
    )
    assert.ok(printButton, 'the ficha must offer Imprimir ficha')

    await dispatch(printButton, 'click')
    await flush()

    assert.equal(printed, 1, 'the printer must be invoked once')
    const sheet = container.querySelector('.ficha-print .ficha-sheet')
    assert.ok(sheet, 'the print target must hold the ficha sheet')
    const text = textOf(sheet)
    assert.match(text, /María José Pérez Gómez/)
    assert.match(text, /Cédula V-12345678/)
    assert.match(text, /Sexo Femenino/)
    assert.match(text, /Datos personales/)
    assert.match(text, /Contacto/)
    assert.match(text, /Datos físicos y salud/)
    assert.ok(
      text.indexOf('Datos personales') < text.indexOf('Cédula') &&
        text.indexOf('Cédula') < text.indexOf('Teléfono'),
      'identity must come before the contact group',
    )
    assert.match(text, /1er Año · Sección A/)
    assert.match(text, /Partida de nacimiento/)
    assert.match(text, /Ana Gómez/)
    assert.match(text, /Impreso el \d{2}\/\d{2}\/\d{4}/)
  } finally {
    stallFetch()
  }
})

/** Fill the "Inscribir en nuevo año" form with a valid inscription. */
async function fillNuevaInscripcion(form, { anioEscolar = '2027-2028' } = {}) {
  const anio = controlNamed(form, 'anio')
  anio.value = '1er Año'
  await dispatch(anio, 'change')
  controlNamed(form, 'seccion').value = 'A'
  controlNamed(form, 'anio_escolar').value = anioEscolar
}

test('Inscribir en nuevo año posts a new inscription, reloads and reopens the ficha', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[0], 'click')
    await flush()

    const ficha = findAll(document.body, '.modal')[0]
    const nueva = findAll(ficha, '.modal__footer .btn').find(
      (button) => textOf(button) === 'Inscribir en nuevo año',
    )
    assert.ok(nueva, 'the ficha must offer "Inscribir en nuevo año"')

    await dispatch(nueva, 'click')
    await flush()

    // The ficha closes before the form opens: one overlay at a time.
    assert.equal(findAll(document.body, '.modal').length, 1)
    const form = findAll(findAll(document.body, '.modal')[0], 'form')[0]
    assert.ok(form, 'the action must open the step-over form')

    // The next school year is pre-filled from the latest inscription.
    assert.equal(controlNamed(form, 'anio_escolar').value, '2027-2028')
    // The six consigned documents start from the most recent inscription.
    assert.equal(inputNamed(form, 'partida_nacimiento').checked, true)
    assert.equal(inputNamed(form, 'copia_cedula').checked, true)
    assert.equal(inputNamed(form, 'boleta').checked, false)
    assert.equal(inputNamed(form, 'fotos').checked, true)

    await fillNuevaInscripcion(form)
    await dispatch(form, 'submit')
    await flush()

    const post = calls.find((call) => call.method === 'POST')
    assert.ok(post, 'saving must POST the new inscription')
    assert.equal(post.url, '/api/estudiantes/7/inscripciones')
    assert.equal(post.body.inscripcion.anio, '1er Año')
    assert.equal(post.body.inscripcion.seccion, 'A')
    assert.equal(post.body.inscripcion.anio_escolar, '2027-2028')
    assert.equal(post.body.inscripcion.regular, true)
    assert.equal(post.body.inscripcion.repite, false)
    assert.match(post.body.inscripcion.fecha_inscripcion, /^\d{4}-\d{2}-\d{2}$/)
    assert.equal(post.body.documentos.partida_nacimiento, true)
    assert.equal(post.body.documentos.boleta, false)
    // Personal data and representatives are out of this flow.
    assert.equal(post.body.estudiante, undefined)
    assert.equal(post.body.representantes, undefined)

    // The form closes, the list reloads and the ficha reopens with the record.
    assert.equal(findAll(document.body, '.ficha').length, 1, 'the ficha must reopen')
    const listGets = calls.filter((call) => call.method === 'GET' && call.url === '/api/estudiantes')
    assert.equal(listGets.length, 2, 'the list must be reloaded after saving')
  } finally {
    stallFetch()
  }
})

test('choosing "Repite el año" fills the grade the student is already in', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[0], 'click')
    await flush()

    const ficha = findAll(document.body, '.modal')[0]
    const nueva = findAll(ficha, '.modal__footer .btn').find(
      (button) => textOf(button) === 'Inscribir en nuevo año',
    )
    await dispatch(nueva, 'click')
    await flush()

    const form = findAll(findAll(document.body, '.modal')[0], 'form')[0]
    const [regular, repite] = findAll(form, 'input[name="tipo_inscripcion"]')
    assert.equal(regular.checked, true, 'regular is the default')
    regular.checked = false
    repite.checked = true
    await dispatch(repite, 'change')

    assert.equal(controlNamed(form, 'anio').value, '1er Año', 'the current grade is pre-selected')
    assert.equal(controlNamed(form, 'seccion').disabled, false, 'its sections are available')
    // The school year still advances: repeating 1er Año happens in the next
    // school year, not in the one already registered.
    assert.equal(controlNamed(form, 'anio_escolar').value, '2027-2028')

    // Switching back to regular must not leave the repeated grade behind.
    regular.checked = true
    repite.checked = false
    await dispatch(regular, 'change')
    assert.equal(controlNamed(form, 'anio').value, '', 'regular asks for the grade again')
  } finally {
    stallFetch()
  }
})

test('a 409 from the step-over endpoint shows the duplicate school-year message', async () => {
  resetBody()
  const base = apiStub()
  respondWith(async (url, options = {}) => {
    if (options.method === 'POST' && url.includes('/inscripciones')) {
      calls.push({ url, method: 'POST', body: options.body ? JSON.parse(options.body) : null })
      return jsonResponse({ code: 'inscripcion_duplicada', message: 'conflict' }, 409)
    }
    return base(url, options)
  })
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[0], 'click')
    await flush()

    const ficha = findAll(document.body, '.modal')[0]
    const nueva = findAll(ficha, '.modal__footer .btn').find(
      (button) => textOf(button) === 'Inscribir en nuevo año',
    )
    await dispatch(nueva, 'click')
    await flush()

    const modal = findAll(document.body, '.modal')[0]
    const form = findAll(modal, 'form')[0]
    await fillNuevaInscripcion(form)
    await dispatch(form, 'submit')
    await flush()

    assert.ok(
      textOf(modal).includes('Ya existe una inscripción para ese año escolar.'),
      `the conflict must name its cause, got: ${textOf(modal)}`,
    )
    assert.equal(findAll(document.body, '.modal').length, 1, 'the form stays open to fix the year')
  } finally {
    stallFetch()
  }
})

test('cancelling the confirmation deletes nothing', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mountList()
    await dispatch(rowActions(container)[2], 'click')
    await flush()

    const modal = findAll(document.body, '.modal')[0]
    const cancel = findAll(modal, '.modal__footer .btn').find((button) => textOf(button) === 'Cancelar')
    assert.ok(cancel, 'the dialog is missing its Cancelar button')
    await dispatch(cancel, 'click')
    await flush()

    assert.equal(calls.find((call) => call.method === 'DELETE'), undefined, 'cancelling must not delete')
    assert.equal(findAll(document.body, '.modal').length, 0, 'the dialog must close')
  } finally {
    stallFetch()
  }
})
