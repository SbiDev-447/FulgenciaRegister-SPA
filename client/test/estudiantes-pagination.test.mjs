// Pagination in the students list: the page the server serves, the summary that
// must count the whole filtered set, and the pager that appears only when there
// is more than one page.

import test from 'node:test'
import assert from 'node:assert/strict'
import { installDom, makeEl, findAll, textOf, dispatch, respondWith, stallFetch } from './dom-stub.mjs'

installDom()

const OPCIONES = { years: [{ label: '1er Año', sections: ['A', 'B'] }] }
const PAGE_SIZE = 20
const TOTAL = 57

/** One row of the list (GET /estudiantes) — the shape the server really returns. */
const row = (index) => ({
  id: index,
  tipo_ci: 'V',
  numero_ci: String(10000000 + index),
  primer_nombre: `Nombre${index}`,
  primer_apellido: `Apellido${index}`,
  sexo: 'F',
  telefono: '0414-1234567',
  anio: '1er Año',
  seccion: 'A',
  anio_escolar: '2026-2027',
})

let calls = []

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) }
}

/** Answer the list as a real paginated endpoint would: `page` decides the rows. */
function pagedStub({ total = TOTAL, pages = Math.ceil(TOTAL / PAGE_SIZE) } = {}) {
  return async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET' })
    if (url.includes('/academico/opciones')) return jsonResponse(OPCIONES)
    if (url.includes('/estudiantes')) {
      const params = new URL(url, 'http://localhost').searchParams
      const page = Number(params.get('page') ?? 1)
      const from = (page - 1) * PAGE_SIZE
      const rows = []
      for (let index = from + 1; index <= Math.min(from + PAGE_SIZE, total); index += 1) {
        rows.push(row(index))
      }
      return jsonResponse({ estudiantes: rows, total, page, pageSize: PAGE_SIZE, pages })
    }
    return jsonResponse({}, 404)
  }
}

async function flush(times = 5) {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

async function mountList() {
  const { renderEstudiantes } = await import('../js/views/estudiantes.js')
  const container = makeEl('div')
  renderEstudiantes(container, { user: {} })
  await flush()
  return container
}

const listCalls = () => calls.filter((call) => call.url.includes('/estudiantes'))

function pagerButtons(container) {
  const pager = findAll(container, '.estudiantes__pager')[0]
  return pager ? findAll(pager, '.btn') : []
}

function buttonByText(container, text) {
  return pagerButtons(container).find((button) => textOf(button).trim() === text)
}

test('the summary counts the whole filtered set and the pager reads the page', async () => {
  calls = []
  respondWith(pagedStub())
  try {
    const container = await mountList()

    assert.equal(
      textOf(findAll(container, '.estudiantes__count')[0]),
      'Mostrando 1–20 de 57 estudiantes',
    )
    const pager = findAll(container, '.estudiantes__pager')[0]
    assert.ok(pager, 'expected a pager when the result spans several pages')
    assert.ok(textOf(pager).includes('Página 1 de 3'), `pager said: ${textOf(pager)}`)
  } finally {
    stallFetch()
  }
})

test('Anterior is disabled on the first page and Siguiente asks for the next one', async () => {
  calls = []
  respondWith(pagedStub())
  try {
    const container = await mountList()

    assert.equal(buttonByText(container, 'Anterior').disabled, true, 'Anterior was clickable on page 1')
    assert.equal(buttonByText(container, 'Siguiente').disabled, false)

    await dispatch(buttonByText(container, 'Siguiente'), 'click')
    await flush()

    assert.ok(
      listCalls().some((call) => call.url.includes('page=2')),
      'the next page was never requested',
    )
    assert.ok(textOf(findAll(container, '.estudiantes__pager')[0]).includes('Página 2 de 3'))
    assert.equal(
      textOf(findAll(container, '.estudiantes__count')[0]),
      'Mostrando 21–40 de 57 estudiantes',
    )
  } finally {
    stallFetch()
  }
})

test('Siguiente is disabled on the last page', async () => {
  calls = []
  respondWith(pagedStub())
  try {
    const container = await mountList()

    await dispatch(buttonByText(container, 'Siguiente'), 'click')
    await flush()
    await dispatch(buttonByText(container, 'Siguiente'), 'click')
    await flush()

    const pager = findAll(container, '.estudiantes__pager')[0]
    assert.ok(textOf(pager).includes('Página 3 de 3'), `pager said: ${textOf(pager)}`)
    assert.equal(buttonByText(container, 'Siguiente').disabled, true, 'Siguiente still advanced past the end')
    assert.equal(buttonByText(container, 'Anterior').disabled, false)
  } finally {
    stallFetch()
  }
})

test('a single page shows no pager and keeps the plain count', async () => {
  calls = []
  respondWith(pagedStub({ total: 1, pages: 1 }))
  try {
    const container = await mountList()

    assert.equal(findAll(container, '.estudiantes__pager').length, 0, 'a one-page result needs no pager')
    assert.equal(textOf(findAll(container, '.estudiantes__count')[0]), '1 estudiante')
  } finally {
    stallFetch()
  }
})

test('changing a filter goes back to the first page', async () => {
  calls = []
  respondWith(pagedStub())
  try {
    const container = await mountList()

    await dispatch(buttonByText(container, 'Siguiente'), 'click')
    await flush()
    assert.ok(listCalls().some((call) => call.url.includes('page=2')))

    const select = findAll(container, 'select')[1]
    select.value = 'B'
    await dispatch(select, 'change')
    await flush()

    const last = listCalls().at(-1)
    assert.ok(!last.url.includes('page=2'), `a stale page survived the filter change: ${last.url}`)
    assert.ok(textOf(findAll(container, '.estudiantes__pager')[0]).includes('Página 1 de 3'))
  } finally {
    stallFetch()
  }
})
