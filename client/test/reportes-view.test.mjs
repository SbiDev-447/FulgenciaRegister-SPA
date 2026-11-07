// Reportes view: filters, roster preview and the printable sheet.
//
// The client ships without a browser, so this pins the two paths that used to
// break invisibly: the year/section selects stay in sync, and "Imprimir" builds
// the sheet from the loaded roster before handing it to the printer.

import test from 'node:test'
import assert from 'node:assert/strict'
import { installDom, makeEl, findAll, textOf, dispatch, respondWith, stallFetch } from './dom-stub.mjs'

installDom()

const OPCIONES = { years: [{ label: '2do Año', sections: ['A', 'B'] }] }

const ROSTER = {
  filtros: { anio: '2do Año', seccion: 'B', anio_escolar: '2026-2027' },
  total: 2,
  estudiantes: [
    {
      id: 1,
      tipo_ci: 'V',
      numero_ci: '11111111',
      primer_nombre: 'María',
      segundo_nombre: 'José',
      primer_apellido: 'Pérez',
      segundo_apellido: 'Gómez',
      sexo: 'F',
    },
    {
      id: 2,
      tipo_ci: 'V',
      numero_ci: '22222222',
      primer_nombre: 'Ana',
      segundo_nombre: null,
      primer_apellido: 'López',
      segundo_apellido: null,
      sexo: 'M',
    },
  ],
}

const EMPTY = {
  filtros: { anio: '2do Año', seccion: 'A', anio_escolar: null },
  total: 0,
  estudiantes: [],
}

let calls = []

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) }
}

function apiStub(roster = ROSTER) {
  return async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET' })
    if (url.includes('/academico/opciones')) return jsonResponse(OPCIONES)
    if (url.includes('/reportes/seccion')) return jsonResponse(roster)
    return jsonResponse({}, 404)
  }
}

async function flush(times = 6) {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

function reset() {
  calls = []
  document.body.replaceChildren()
}

async function mount({ print } = {}) {
  const { renderReportes } = await import('../js/views/reportes.js')
  const container = makeEl('div')
  renderReportes(container, { print: print ?? (() => {}) })
  await flush()
  return container
}

function select(container, cls) {
  return findAll(container, `.reportes__select.${cls}`)[0]
}

async function choose(container, { anio = '2do Año', seccion = 'B' } = {}) {
  const anioSelect = select(container, 'reportes__anio')
  anioSelect.value = anio
  await dispatch(anioSelect, 'change')

  const seccionSelect = select(container, 'reportes__seccion')
  seccionSelect.value = seccion
  await dispatch(seccionSelect, 'change')
  await flush()
}

test('the view paints the filters and the hidden print target', async () => {
  reset()
  respondWith(apiStub())
  try {
    const container = await mount()

    assert.equal(findAll(container, '.reportes__anio').length, 1, 'expected the year select')
    assert.equal(findAll(container, '.reportes__seccion').length, 1, 'expected the section select')
    assert.equal(findAll(container, '.reportes__print').length, 1, 'expected the print target')
    assert.equal(findAll(container, '.reportes__table').length, 0, 'no roster before choosing')
    // Sections follow the year: without a year there is nothing to pick.
    assert.equal(select(container, 'reportes__seccion').disabled, true)
    assert.match(textOf(container), /Reportes/)
  } finally {
    stallFetch()
  }
})

test('choosing a year fills its sections and choosing one loads the roster', async () => {
  reset()
  respondWith(apiStub())
  try {
    const container = await mount()
    await choose(container)

    const request = calls.find((call) => call.url.includes('/reportes/seccion'))
    assert.ok(request, 'the roster must be requested')
    assert.match(request.url, /anio=2do\+A%C3%B1o/, 'the grade travels in the query')
    assert.match(request.url, /seccion=B/)

    assert.equal(findAll(container, '.reportes__table tbody tr').length, 2)
    assert.match(textOf(container), /Pérez Gómez, María José/)
    assert.match(textOf(container), /López, Ana/)
    assert.match(textOf(container), /2026-2027/)
  } finally {
    stallFetch()
  }
})

test('a section with no students shows an explicit empty state', async () => {
  reset()
  respondWith(apiStub(EMPTY))
  try {
    const container = await mount()
    await choose(container, { seccion: 'A' })

    assert.equal(findAll(container, '.reportes__table').length, 0)
    assert.match(textOf(container), /No hay estudiantes inscritos en esta sección/)
  } finally {
    stallFetch()
  }
})

test('Imprimir builds the sheet from the loaded roster and calls the printer', async () => {
  reset()
  respondWith(apiStub())
  let printed = 0
  try {
    const container = await mount({ print: () => { printed += 1 } })
    await choose(container)

    const printButton = findAll(container, '.reportes__imprimir')[0]
    assert.ok(printButton, 'expected the print button')
    await dispatch(printButton, 'click')

    assert.equal(printed, 1, 'the printer must be invoked once')
    assert.equal(findAll(container, '.reportes__print .roster-sheet').length, 1)
    assert.equal(findAll(container, '.reportes__print tbody tr').length, 2)
    assert.match(textOf(container.querySelector('.reportes__print')), /Lista de estudiantes/)
    assert.match(textOf(container.querySelector('.reportes__print')), /Sección "B"/)
  } finally {
    stallFetch()
  }
})

test('changing the year resets the section so an invalid pair is never sent', async () => {
  reset()
  respondWith(apiStub())
  try {
    const container = await mount()
    await choose(container)

    const anioSelect = select(container, 'reportes__anio')
    anioSelect.value = '2do Año'
    await dispatch(anioSelect, 'change')

    assert.equal(select(container, 'reportes__seccion').value, '')
    assert.equal(findAll(container, '.reportes__print .roster-sheet').length, 0)
  } finally {
    stallFetch()
  }
})
