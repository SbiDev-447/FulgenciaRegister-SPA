// Inicio (dashboard) behavior: the breakdown must follow the active year filter
// instead of silently ignoring it, and the empty state must tell the user what
// to do. These are DOM-independent assertions over the fake DOM stub.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  installDom,
  makeEl,
  findAll,
  textOf,
  respondWith,
  stallFetch,
  dispatch,
} from './dom-stub.mjs'

installDom()

const OPCIONES = {
  years: [
    { label: '1er Año', sections: ['A', 'B'] },
    { label: '2do Año', sections: ['A', 'B'] },
  ],
}

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return Promise.resolve({
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: { get: () => null },
  })
}

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

async function mountInicio() {
  const mod = await import(new URL('../js/views/inicio.js', import.meta.url))
  const container = makeEl('div')
  mod.renderInicio(container, { user: { nombre: 'Admin' } })
  await flush()
  return container
}

test('inicio switches the breakdown to sections when a year is chosen', async (t) => {
  t.after(stallFetch)

  respondWith((url) => {
    if (url.includes('/academico/opciones')) return jsonResponse(OPCIONES)
    if (url.includes('anio=')) {
      return jsonResponse({
        filtros: { anio: '1er Año', seccion: null },
        estudiantes: { total: 3, mujeres: 2, hombres: 1 },
        condicion: { repitientes: 1, regulares: 2 },
        continuidad: { nuevos: 2, continuos: 1 },
        porAnio: [{ anio: '1er Año', total: 3, mujeres: 2, hombres: 1 }],
        porSeccion: [
          { seccion: 'A', total: 2, mujeres: 1, hombres: 1 },
          { seccion: 'B', total: 1, mujeres: 1, hombres: 0 },
        ],
        documentosEmitidos: 1,
        actualizadoEn: '2026-11-07T12:00:00.000Z',
      })
    }
    return jsonResponse({
      filtros: { anio: null, seccion: null },
      estudiantes: { total: 3, mujeres: 2, hombres: 1 },
      porAnio: [
        { anio: '1er Año', total: 3, mujeres: 2, hombres: 1 },
        { anio: '2do Año', total: 0, mujeres: 0, hombres: 0 },
      ],
      porSeccion: [],
      documentosEmitidos: 1,
      actualizadoEn: '2026-11-07T12:00:00.000Z',
    })
  })

  const container = await mountInicio()
  const [anioSelect] = findAll(container, '.inicio__select')
  assert.ok(anioSelect, 'the year select is missing')

  // The cross-year panorama is the no-filter default.
  assert.match(textOf(container), /Distribución por año/)
  // Years without inscriptions are dropped instead of rendering blank bars.
  assert.equal(findAll(container, '.inicio__row').length, 1)

  anioSelect.value = '1er Año'
  await dispatch(anioSelect, 'change')
  await flush()

  const text = textOf(container)
  assert.match(text, /Distribución por sección · 1er Año/)
  assert.match(text, /Inscripciones del año seleccionado, por sección\./)
  assert.equal(findAll(container, '.inicio__row').length, 2)
  // The bar is now composition-aware (women/men) and the legend explains it.
  assert.equal(findAll(container, '.inicio__legend-item').length, 2)
  assert.equal(findAll(container, '.inicio__bar-fill--mujeres').length, 2)
  assert.equal(findAll(container, '.inicio__bar-fill--hombres').length, 1)
  // The two sex cards now explain their share of the total.
  assert.match(text, /67% del total/)
  // Condition and continuity get their own composition panel.
  assert.match(text, /Composición de la matrícula/)
  assert.equal(findAll(container, '.inicio__chart-bar').length, 4)
  assert.match(text, /Regulares/)
  assert.match(text, /Repitientes/)
  assert.match(text, /Continuos/)
  assert.match(text, /Nuevos/)
  // The tallest value scales every bar, so it fills the chart height.
  const tallest = findAll(container, '.inicio__chart-column')[0]
  assert.equal(tallest.style.height, '100%')
  // An active filter exposes the reset affordance.
  assert.equal(findAll(container, '.inicio__clear')[0].hidden, false)
})

test('inicio paints a skeleton while the numbers travel', async (t) => {
  t.after(stallFetch)

  // Options resolve, but the statistics never do: the view stays on the
  // skeleton it painted when it requested them.
  respondWith((url) => {
    if (url.includes('/academico/opciones')) return jsonResponse(OPCIONES)
    return new Promise(() => {})
  })

  const mod = await import(new URL('../js/views/inicio.js', import.meta.url))
  const container = makeEl('div')
  mod.renderInicio(container, { user: { nombre: 'Admin' } })
  await flush()

  assert.equal(findAll(container, '.inicio__skeleton-line--value').length, 4)
  assert.ok(findAll(container, '.inicio__skeleton').length >= 5)
  assert.match(textOf(container), /Cargando estadísticas/)
})

test('inicio shows an explicit empty state with no inscriptions', async (t) => {
  t.after(stallFetch)

  respondWith((url) => {
    if (url.includes('/academico/opciones')) return jsonResponse(OPCIONES)
    return jsonResponse({
      filtros: { anio: null, seccion: null },
      estudiantes: { total: 0, mujeres: 0, hombres: 0 },
      porAnio: [{ anio: '1er Año', total: 0, mujeres: 0, hombres: 0 }],
      porSeccion: [],
      documentosEmitidos: 0,
      actualizadoEn: '2026-11-07T12:00:00.000Z',
    })
  })

  const container = await mountInicio()
  const text = textOf(container)
  assert.match(text, /Todavía no hay inscripciones registradas\./)
  assert.equal(findAll(container, 'a.btn[href="#/inscripcion"]').length, 1)
})
