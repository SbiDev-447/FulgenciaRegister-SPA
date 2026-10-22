// The inscription form is a view of its own (`#/inscripcion`), reached from the
// primary action of Estudiantes (S22). It used to be a modal; these tests pin
// what changed and why it cannot go back to depending on the list.

import test from 'node:test'
import assert from 'node:assert/strict'
import { installDom, makeEl, findAll, textOf, dispatch, respondWith, stallFetch } from './dom-stub.mjs'

installDom()

const OPCIONES = { years: [{ label: '1er Año', sections: ['A', 'B'] }] }

/** Answer `/api/academico/opciones` with one year: enough for the wizard to paint. */
function answerOptions() {
  respondWith(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(OPCIONES) }))
}

/** Set a control the way a person would, so the view reacts to the change. */
async function write(node, value) {
  node.value = value
  await dispatch(node, node.tagName === 'SELECT' ? 'change' : 'input')
}

/** Let the view's fetch → then() chains settle. */
async function flush(times = 5) {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

/**
 * The control of the field labelled `label`. Selected through the visible text:
 * a label is what the person reads, and a renamed field must fail the test
 * loudly instead of quietly filling nothing.
 * @param {object} container
 * @param {string} label
 */
function controlLabelled(container, label) {
  const wrapper = findAll(container, '.field').find((node) => textOf(node).includes(label))
  const found = wrapper ? findAll(wrapper, 'input, select')[0] : null
  assert.ok(found, `the form has no control labelled "${label}"`)
  return found
}

/**
 * Fill the whole wizard up to the Documentos step, which is only reachable with
 * the three previous steps valid.
 * @param {object} container
 */
async function fillUntilDocumentos(container) {
  const byPlaceholder = (placeholder) => {
    const found = findAll(container, `input[placeholder="${placeholder}"]`)[0]
    assert.ok(found, `the form has no field with placeholder "${placeholder}"`)
    return found
  }

  await write(byPlaceholder('12345678'), '12345678')
  await write(byPlaceholder('Primer nombre'), 'María')
  await write(byPlaceholder('Segundo nombre'), 'Isabel')
  await write(byPlaceholder('Primer apellido'), 'Pérez')
  await write(byPlaceholder('Segundo apellido'), 'Rojas')
  // The first of the two dd/mm/aaaa fields: birth date, then inscription date.
  await write(byPlaceholder('dd/mm/aaaa'), '10/04/2012')
  await write(controlLabelled(container, 'Sexo'), 'F')
  await write(byPlaceholder('0414-1234567'), '0412-5551234')
  await write(byPlaceholder('correo@ejemplo.com'), 'maria@ejemplo.com')
  await write(byPlaceholder('Venezuela'), 'Venezuela')
  await write(byPlaceholder('Estado'), 'Miranda')
  await write(byPlaceholder('Municipio'), 'Sucre')
  await write(controlLabelled(container, 'Lateralidad'), 'Derecha')

  // The year list comes from the API answer above; picking one is what fills the
  // sections. The school year and the inscription date carry a default.
  await write(controlLabelled(container, 'Año *'), '1er Año')
  await write(controlLabelled(container, 'Sección *'), 'A')

  await write(byPlaceholder('Nombre y apellido'), 'Ana Pérez')
  await write(byPlaceholder('Cédula'), '87654321')
  await write(byPlaceholder('Teléfono'), '0414-5559876')
  await write(byPlaceholder('Correo'), 'ana@ejemplo.com')
}

test('the inscription view paints the wizard with a footer of its own', async () => {
  answerOptions()
  const { renderInscripcion } = await import('../js/views/inscripcion.js')
  const container = makeEl('div')

  try {
    await renderInscripcion(container, { user: {} })
  } finally {
    stallFetch()
  }

  assert.ok(findAll(container, '.inscripcion')[0], 'the wizard did not mount into the view')

  const footer = findAll(container, '.inscripcion__footer')[0]
  assert.ok(footer, 'the wizard needs its own footer now that no modal provides one')
  const labels = textOf(footer)
  for (const label of ['Cancelar', 'Atrás', 'Siguiente']) {
    assert.ok(labels.includes(label), `the footer is missing "${label}"`)
  }

  assert.equal(findAll(document.body, '.modal').length, 0, 'a view must not open a modal')
})

test('the inscription view loads its own options, without passing through the list', async () => {
  answerOptions()
  const { renderInscripcion } = await import('../js/views/inscripcion.js')
  const container = makeEl('div')

  try {
    await renderInscripcion(container, { user: {} })
  } finally {
    stallFetch()
  }

  const wizard = findAll(container, '.inscripcion')[0]
  assert.ok(wizard, 'the wizard did not mount into the view')
  // The year list comes from /api/academico/opciones: the view fetched it on its
  // own, so a direct visit, a reload or the browser's back button works without
  // Estudiantes having loaded anything first.
  const years = findAll(wizard, 'select option').map((option) => textOf(option))
  assert.ok(years.includes('1er Año'), `the year selector was not filled: got ${years.join(', ')}`)
})

test('leaving the wizard goes back to the students list', async () => {
  answerOptions()
  const { renderInscripcion } = await import('../js/views/inscripcion.js')
  const container = makeEl('div')

  try {
    await renderInscripcion(container, { user: {} })
  } finally {
    stallFetch()
  }

  window.location.hash = ''
  const cancel = findAll(container, '.inscripcion__footer .btn--ghost')[0]
  assert.ok(cancel, 'the footer is missing its Cancelar button')
  await dispatch(cancel, 'click')

  assert.equal(window.location.hash, '/estudiantes', 'Cancelar must return to the list')
})

test('the students action requests the inscription route', async () => {
  const { renderEstudiantes } = await import('../js/views/estudiantes.js')
  const container = makeEl('div')
  renderEstudiantes(container, { user: {} })

  window.location.hash = ''
  const action = findAll(container, '.estudiantes__bar .btn--primary')[0]
  assert.ok(action, 'the primary action is missing from the bar')
  await dispatch(action, 'click')

  assert.equal(window.location.hash, '/inscripcion')
})

test('the wizard asks for dates as dd/mm/aaaa, not as a locale-dependent picker', async () => {
  answerOptions()
  const { renderInscripcion } = await import('../js/views/inscripcion.js')
  const container = makeEl('div')

  try {
    await renderInscripcion(container, { user: {} })
  } finally {
    stallFetch()
  }

  const fields = findAll(container, 'input[placeholder="dd/mm/aaaa"]')
  assert.equal(
    fields.length,
    2,
    'the birth date and the inscription date must be written the same way',
  )
  for (const field of fields) {
    assert.notEqual(
      field.attributes.type,
      'date',
      'a native picker shows the order of the browser locale, not ours',
    )
  }
  // The inscription date defaults to today, already written the Latin American way.
  assert.match(fields[1].value, /^\d{2}\/\d{2}\/\d{4}$/, `got ${fields[1].value}`)
})

test('both date fields of the wizard place their own separators', async () => {
  answerOptions()
  const { renderInscripcion } = await import('../js/views/inscripcion.js')
  const container = makeEl('div')

  try {
    await renderInscripcion(container, { user: {} })
  } finally {
    stallFetch()
  }

  const [nacimiento, inscripcion] = findAll(container, 'input[placeholder="dd/mm/aaaa"]')
  for (const field of [nacimiento, inscripcion]) {
    // The inscription field arrives pre-filled with today, and a value that
    // shrinks is believed as it is (that is what keeps backspace working), so it
    // is emptied first, the way a person replacing the date would.
    field.value = ''
    await dispatch(field, 'input')
    // The numeric keypad of a phone has no slash key: the field supplies it.
    field.value = '04'
    await dispatch(field, 'input')
    assert.equal(field.value, '04/', 'the field must write its own separator')
  }
})

test('the wizard refuses a written date that is not a real day', async () => {
  answerOptions()
  const { renderInscripcion } = await import('../js/views/inscripcion.js')
  const container = makeEl('div')

  try {
    await renderInscripcion(container, { user: {} })
  } finally {
    stallFetch()
  }

  const [nacimiento] = findAll(container, 'input[placeholder="dd/mm/aaaa"]')
  // A text field no longer rejects this on its own the way a date picker did:
  // February has no 31st, and a naive parse would roll it to March 3rd.
  nacimiento.value = '31/02/2010'
  await dispatch(findAll(container, '.inscripcion__footer .btn--primary')[0], 'click')

  // The placeholder is an attribute, so finding this text proves the message
  // itself was rendered and not just the empty field's hint.
  const errors = textOf(container)
  assert.ok(errors.includes('dd/mm/aaaa'), `the wizard must say how a date is written: ${errors}`)
  assert.equal(
    findAll(container, '.inscripcion__section')[0].hidden,
    false,
    'a bad date must not let the wizard move on to the next step',
  )
})

test('reaching the Documentos step never saves the inscription on its own', async () => {
  answerOptions()
  const { renderInscripcion } = await import('../js/views/inscripcion.js')
  const container = makeEl('div')

  try {
    await renderInscripcion(container, { user: {} })
  } finally {
    stallFetch()
  }

  await fillUntilDocumentos(container)
  const next = findAll(container, '.inscripcion__footer .btn--primary')[0]
  for (let step = 0; step < 3; step += 1) {
    await dispatch(next, 'click')
  }

  const secciones = findAll(container, '.inscripcion__section')
  const errors = findAll(container, '.inscripcion__error')[0]
  assert.equal(
    secciones[3].hidden,
    false,
    `the wizard should have reached Documentos: ${textOf(errors)}`,
  )
  assert.ok(
    textOf(next).includes('Guardar inscripción'),
    'the last step must offer to save, not to advance',
  )

  // A browser submits the form when the button it activated is a submit button,
  // and it reads that button AFTER the click handler ran. Turning "Siguiente"
  // into a submit button while arriving here made the step change itself submit
  // an empty Documentos step, so the error summary opened before the user asked
  // to save anything.
  assert.equal(
    next.type,
    'button',
    'moving to the last step must not make the button a submit button',
  )
  assert.equal(errors.hidden, true, `nothing was saved yet: ${textOf(errors)}`)
})

test('the last step saves the inscription, but only when it is asked to', async () => {
  const calls = []
  respondWith(async (url, options = {}) => {
    calls.push({
      url,
      method: options.method ?? 'GET',
      body: options.body ? JSON.parse(options.body) : null,
    })
    const payload = url.includes('/academico/opciones') ? OPCIONES : { estudiante: { id: 1 } }
    return { ok: true, status: 201, text: async () => JSON.stringify(payload) }
  })

  const { renderInscripcion } = await import('../js/views/inscripcion.js')
  const container = makeEl('div')
  window.location.hash = ''

  try {
    await renderInscripcion(container, { user: {} })
    await fillUntilDocumentos(container)

    const save = findAll(container, '.inscripcion__footer .btn--primary')[0]
    for (let step = 0; step < 3; step += 1) {
      await dispatch(save, 'click')
    }
    assert.equal(
      calls.filter((call) => call.method === 'POST').length,
      0,
      'walking to the last step must not save anything',
    )

    for (const box of findAll(container, 'input[type="checkbox"]')) {
      box.checked = true
    }
    await dispatch(save, 'click')
    await flush()

    const post = calls.find((call) => call.method === 'POST')
    assert.ok(post, 'Guardar inscripción must save the inscription')
    assert.equal(post.url, '/api/estudiantes')
    assert.equal(post.body.estudiante.primer_nombre, 'María')
    assert.equal(post.body.estudiante.lateralidad, 'Derecha')
    // Written dd/mm/aaaa, stored ISO: the API never sees the Spanish form.
    assert.equal(post.body.estudiante.fecha_nacimiento, '2012-04-10')
    assert.equal(post.body.inscripcion.anio, '1er Año')
    assert.equal(post.body.inscripcion.seccion, 'A')
    assert.equal(post.body.representantes.length, 1)
    assert.equal(post.body.representantes[0].nombre, 'Ana Pérez')
    assert.equal(post.body.representantes[0].numero_ci, '87654321')
    assert.equal(post.body.documentos.partida_nacimiento, true)
    assert.equal(window.location.hash, '/estudiantes', 'saving must return to the list')
  } finally {
    stallFetch()
  }
})

test('a rejected save leaves the button ready to try again', async () => {
  respondWith(async (url) => {
    if (url.includes('/academico/opciones')) {
      return { ok: true, status: 200, text: async () => JSON.stringify(OPCIONES) }
    }
    // The server is stricter than the form: it can still reject a value the
    // client accepted, and the user has to be able to fix it and retry.
    return {
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({ code: 'bad_request', message: 'Bad request', details: { correo: 'is required' } }),
    }
  })

  const { renderInscripcion } = await import('../js/views/inscripcion.js')
  const container = makeEl('div')
  window.location.hash = ''

  try {
    await renderInscripcion(container, { user: {} })
    await fillUntilDocumentos(container)

    const save = findAll(container, '.inscripcion__footer .btn--primary')[0]
    for (let step = 0; step < 3; step += 1) {
      await dispatch(save, 'click')
    }
    for (const box of findAll(container, 'input[type="checkbox"]')) {
      box.checked = true
    }
    await dispatch(save, 'click')
    await flush()

    const errors = findAll(container, '.inscripcion__error')[0]
    assert.equal(errors.hidden, false, 'the rejection must be visible')
    assert.ok(
      textOf(errors).includes('Correo'),
      `the reason must reach the user in Spanish: ${textOf(errors)}`,
    )
    // The rejection belongs to step 1, where the field is, so the wizard goes
    // back there; the button keeps its advancing wording and works again.
    assert.equal(findAll(container, '.inscripcion__section')[0].hidden, false, 'step 1 must be shown')
    assert.equal(save.disabled, false, 'a rejected save must not leave the button dead')
    assert.ok(
      textOf(save).includes('Siguiente'),
      `the button must not promise a save it no longer performs: ${textOf(save)}`,
    )
    assert.equal(window.location.hash, '', 'a rejected save must not leave the wizard')
  } finally {
    stallFetch()
  }
})

test('a value the column cannot hold reaches the user in Spanish and marks its field', async () => {
  // The server now answers 400 naming the column the database refused (a value
  // too long, out of range or of the wrong type). The form has to carry that to
  // the person: a reason with no translation would show the raw English, and a
  // field with no control mapped would leave them hunting for what to fix.
  respondWith(async (url) => {
    if (url.includes('/academico/opciones')) {
      return { ok: true, status: 200, text: async () => JSON.stringify(OPCIONES) }
    }
    return {
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          code: 'bad_request',
          message: 'A value does not fit its column',
          details: { peso: 'is out of range' },
        }),
    }
  })

  const { renderInscripcion } = await import('../js/views/inscripcion.js')
  const container = makeEl('div')
  window.location.hash = ''

  try {
    await renderInscripcion(container, { user: {} })
    await fillUntilDocumentos(container)

    const save = findAll(container, '.inscripcion__footer .btn--primary')[0]
    for (let step = 0; step < 3; step += 1) {
      await dispatch(save, 'click')
    }
    for (const box of findAll(container, 'input[type="checkbox"]')) {
      box.checked = true
    }
    await dispatch(save, 'click')
    await flush()

    const errors = findAll(container, '.inscripcion__error')[0]
    assert.equal(errors.hidden, false, 'the rejection must be visible')
    assert.ok(
      textOf(errors).includes('Peso está fuera de rango.'),
      `the reason must reach the user in Spanish: ${textOf(errors)}`,
    )
    assert.ok(
      !textOf(errors).includes('is out of range'),
      `the raw server reason must never be shown: ${textOf(errors)}`,
    )

    const peso = controlLabelled(container, 'Peso (kg)')
    assert.ok(
      peso.classList.contains('input-error'),
      'the field the database refused must be marked',
    )
  } finally {
    stallFetch()
  }
})

test('the route table wires /inscripcion to its own sidebar entry', async () => {
  const { resolve } = await import('../js/routes.js')

  const match = resolve('/inscripcion')
  assert.ok(match, 'the inscription route is not registered')
  assert.equal(match.title, 'Nueva inscripción')
  assert.equal(
    match.activePath,
    undefined,
    'the wizard has its own nav entry now, so it highlights itself',
  )
})
