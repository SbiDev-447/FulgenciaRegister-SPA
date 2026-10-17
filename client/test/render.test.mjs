// Smoke tests for the client: every view is EXECUTED against a fake DOM.
//
// These tests exist because `node --check` cannot catch a runtime error that
// stops a view from painting (that is how the Estudiantes view broke). They are
// not a DOM test suite: they prove the render path runs and that the pieces the
// views promise are in the tree.

import test from 'node:test'
import assert from 'node:assert/strict'
import { installDom, makeEl, findAll, textOf } from './dom-stub.mjs'

installDom()

const USER = { nombre: 'Admin', rol: 'admin' }

const VIEWS = [
  ['inicio', '../js/views/inicio.js', 'renderInicio'],
  ['estudiantes', '../js/views/estudiantes.js', 'renderEstudiantes'],
  ['documentos', '../js/views/documentos.js', 'renderDocumentos'],
  ['login', '../js/views/login.js', 'renderLogin'],
  ['notFound', '../js/views/notFound.js', 'renderNotFound'],
]

for (const [name, file, exportName] of VIEWS) {
  test(`${name} view renders a node into its container`, async () => {
    const mod = await import(new URL(file, import.meta.url))
    const container = makeEl('div')
    await mod[exportName](container, { user: USER, path: '/x' })
    assert.ok(
      container.children.length > 0,
      `${exportName} painted nothing: the render threw or returned early`,
    )
  })
}

test('estudiantes paints the bar with the search, the filters and the action', async () => {
  const mod = await import(new URL('../js/views/estudiantes.js', import.meta.url))
  const container = makeEl('div')
  mod.renderEstudiantes(container, { user: USER })

  const root = container.children[0]
  const bar = findAll(root, '.estudiantes__bar')[0]
  assert.ok(bar, 'the bar is missing')
  assert.equal(bar.tagName, 'FORM', 'the bar is the form, so Enter in the search submits it')
  assert.equal(findAll(bar, '.estudiantes__search').length, 1, 'the search wrapper is missing')
  assert.equal(findAll(bar, '.estudiantes__search input[type="search"]').length, 1, 'the search input is missing')
  assert.equal(findAll(bar, '.estudiantes__field').length, 2, 'the two filters are missing')
  assert.equal(findAll(bar, '.btn--primary').length, 1, 'the primary action belongs to the bar')

  const text = textOf(root)
  assert.ok(text.includes('Buscar'), 'the search button label is missing')
  assert.ok(text.includes('Nueva inscripción'), 'the primary action label is missing')
})

test('the inscription wizard shows one of its four steps at a time', async () => {
  const mod = await import(new URL('../js/features/inscripcion.js', import.meta.url))
  const host = makeEl('div')
  // The wizard is a page now (S22): it paints itself and its own footer into the
  // container the view hands it, instead of opening a modal.
  mod.renderInscripcionWizard(host, { opciones: null, onExit: () => {} })

  const form = findAll(host, '.inscripcion')[0]
  assert.ok(form, 'the wizard form did not mount')

  const sections = findAll(form, '.inscripcion__section')
  assert.equal(sections.length, 4, 'the wizard must take its four steps from the four sections')

  const visible = sections.filter((section) => !section.hidden)
  assert.equal(visible.length, 1, 'exactly one step is visible at a time')
  assert.equal(sections[0].hidden, false, 'the first step is the one shown')

  assert.equal(findAll(form, '.inscripcion__step').length, 4, 'the stepper needs one item per step')

  // The buttons live in the wizard's own footer, outside the form, and reach it
  // through the `form` attribute.
  const footer = textOf(findAll(host, '.inscripcion__footer')[0])
  assert.ok(footer.includes('Siguiente'), 'the primary button must offer the next step')
  assert.ok(footer.includes('Atrás'), 'the back button is missing')
  assert.ok(footer.includes('Cancelar'), 'the cancel button is missing')
})
