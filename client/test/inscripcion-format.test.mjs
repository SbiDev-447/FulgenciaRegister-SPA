// The wizard must USE the contact-format rules, not merely own a module that
// has them (S1, S2 of odd/tasks/higiene-datos.md). These tests render the real
// form, type a bad value and submit: the same path a user walks.

import test from 'node:test'
import assert from 'node:assert/strict'
import { installDom, makeEl, findAll, textOf, dispatch, respondWith, stallFetch } from './dom-stub.mjs'

installDom()

const OPCIONES = { years: [{ label: '1er Año', sections: ['A', 'B'] }] }

/** Answer `/api/academico/opciones` with one year: enough for the wizard to paint. */
function answerOptions() {
  respondWith(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(OPCIONES) }))
}

/** Render the wizard and hand back its form plus the control with `placeholder`. */
async function paintWizard() {
  answerOptions()
  const { renderInscripcion } = await import('../js/views/inscripcion.js')
  const container = makeEl('div')
  try {
    await renderInscripcion(container, { user: {} })
  } finally {
    stallFetch()
  }
  const form = findAll(container, '.inscripcion')[0]
  const control = (placeholder) =>
    findAll(container, 'input').find((input) => input.getAttribute('placeholder') === placeholder)
  return { form, control, container }
}

/** Submit the form and return what the alert box shows the user. */
async function submitAndReadAlert(form, container) {
  await dispatch(form, 'submit')
  const alert = findAll(container, '.inscripcion__error')[0]
  return alert ? textOf(alert) : ''
}

test('an email without the algo@algo.algo shape is reported on submit', async () => {
  const { form, control, container } = await paintWizard()
  control('correo@ejemplo.com').value = 'sin-arroba'

  const alert = await submitAndReadAlert(form, container)

  assert.ok(
    alert.includes('El correo del estudiante no tiene un formato válido.'),
    `the format error was not reported; the alert said: ${alert}`,
  )
})

test('a phone with letters is reported on submit', async () => {
  const { form, control, container } = await paintWizard()
  control('0414-1234567').value = 'llamar a mama'

  const alert = await submitAndReadAlert(form, container)

  assert.ok(
    alert.includes('El teléfono del estudiante no tiene un formato válido.'),
    `the format error was not reported; the alert said: ${alert}`,
  )
})

test('a well-formed contact pair produces no format error', async () => {
  const { form, control, container } = await paintWizard()
  control('correo@ejemplo.com').value = 'ana.perez@ejemplo.com'
  control('0414-1234567').value = '+58 414 1234567'

  const alert = await submitAndReadAlert(form, container)

  assert.ok(!alert.includes('no tiene un formato válido'), `unexpected format error: ${alert}`)
})

test('an empty contact field keeps its old "missing" message, not a format one', async () => {
  // The format rule was added as an else-branch of the required check: leaving
  // the field empty must still say "Falta …", exactly as before this change.
  const { form, container } = await paintWizard()

  const alert = await submitAndReadAlert(form, container)

  assert.ok(alert.includes('Falta el correo del estudiante.'), `lost the missing-email message: ${alert}`)
  assert.ok(alert.includes('Falta el teléfono del estudiante.'), `lost the missing-phone message: ${alert}`)
  assert.ok(!alert.includes('no tiene un formato válido'), `an empty field must not be a format error: ${alert}`)
})
