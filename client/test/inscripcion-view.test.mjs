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

test('the route table wires /inscripcion and keeps Estudiantes highlighted', async () => {
  const { resolve } = await import('../js/routes.js')

  const match = resolve('/inscripcion')
  assert.ok(match, 'the inscription route is not registered')
  assert.equal(match.title, 'Nueva inscripción')
  assert.equal(
    match.activePath,
    '/estudiantes',
    'the sidebar has no entry for the wizard: Estudiantes stays highlighted',
  )
})
