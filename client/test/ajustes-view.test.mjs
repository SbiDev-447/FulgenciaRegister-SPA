// Ajustes view: the director that signs, the ministry logo, and the two
// maintenance jobs.
//
// The screen is driven against the real contract shape (`{ director, logo,
// positions, maxLogoBytes }`, the `{ code, message, details }` envelope), so a
// change on either side breaks a test instead of the school's letterhead.

import test from 'node:test'
import assert from 'node:assert/strict'
import { installDom, makeEl, findAll, textOf, dispatch, respondWith, stallFetch } from './dom-stub.mjs'

installDom()

const SETTINGS = {
  director: { nombre: 'Ana Pérez', ci: 'V-12345678', cargo: 'Directora' },
  logo: { url: '/api/ajustes/logo?v=2026-10-30', mime: 'image/png', bytes: 70 },
  positions: ['Director', 'Directora'],
  maxLogoBytes: 2 * 1024 * 1024,
}

const ADMIN = { nombre: 'Admin', rol: 'admin' }
const DOCENTE = { nombre: 'Docente', rol: 'docente' }

let calls = []

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) }
}

/** Answers the endpoints the view talks to and records every request. */
function apiStub(overrides = {}) {
  return async (url, options = {}) => {
    const method = options.method ?? 'GET'
    calls.push({ url, method, body: options.body ? JSON.parse(options.body) : null })

    if (overrides.error && overrides.error.url === url) {
      return jsonResponse({ code: overrides.error.code, message: overrides.error.message, details: overrides.error.details }, overrides.error.status)
    }
    if (url.endsWith('/ajustes') && method === 'GET') return jsonResponse(SETTINGS)
    if (url.endsWith('/ajustes/director')) return jsonResponse({ ...JSON.parse(options.body), actualizadoEn: '2026-10-30 10:00:00' })
    if (url.endsWith('/representantes-huerfanos')) {
      return jsonResponse({
        total: 2,
        representantes: [
          { id: 1, tipo_ci: 'V', numero_ci: '11111111', nombre: 'Sin Estudiante Uno' },
          { id: 2, tipo_ci: 'V', numero_ci: '22222222', nombre: 'Sin Estudiante Dos' },
        ],
      })
    }
    if (url.endsWith('/purgar-representantes')) return jsonResponse({ encontrados: 2, eliminados: [{ id: 1 }, { id: 2 }], restantes: 0 })
    if (url.endsWith('/backup')) return jsonResponse({ archivo: 'backups/fulgencia-2026-10-30-101500.sql', bytes: 27275, tablas: ['estudiantes', 'representantes'], baseDeDatos: 'fulgencia', configuracion: 'backups/fulgencia-2026-10-30-101500.datos' })
    return jsonResponse({}, 404)
  }
}

async function flush(times = 6) {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

function resetBody() {
  document.body.replaceChildren()
  calls = []
}

async function mount(user = ADMIN) {
  const { renderAjustes } = await import('../js/views/ajustes.js')
  const container = makeEl('div')
  renderAjustes(container, { user })
  await flush()
  return container
}

function inputNamed(root, name) {
  return findAll(root, `input[name="${name}"]`)[0]
}

function buttonWithText(root, label) {
  return findAll(root, '.btn').find((button) => textOf(button) === label)
}

test('fills the director and the logo with what the API stored', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mount()

    assert.equal(inputNamed(container, 'nombre').value, 'Ana Pérez')
    assert.equal(inputNamed(container, 'ci').value, 'V-12345678')
    assert.equal(findAll(container, 'select[name="cargo"]')[0].value, 'Directora')

    const logo = findAll(container, '.ajustes__logo')[0]
    assert.match(logo.src, /\/api\/ajustes\/logo/)
  } finally {
    stallFetch()
  }
})

test('saving the director PUTs the typed values and confirms in Spanish', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mount()

    inputNamed(container, 'nombre').value = 'Luis Rodríguez'
    inputNamed(container, 'ci').value = 'v87654321'
    findAll(container, 'select[name="cargo"]')[0].value = 'Director'

    await dispatch(findAll(container, '[id="ajustes-director-form"]')[0], 'submit')
    await flush()

    const put = calls.find((call) => call.method === 'PUT' && call.url.endsWith('/ajustes/director'))
    assert.deepEqual(put.body, { nombre: 'Luis Rodríguez', ci: 'v87654321', cargo: 'Director' })

    const status = findAll(container, '[id="ajustes-director-status"]')[0]
    assert.match(textOf(status), /Guardado/)
    assert.ok(findAll(container, '.ajustes__status--ok').includes(status))
  } finally {
    stallFetch()
  }
})

test('a rejected save marks the field and never shows the API English message', async () => {
  resetBody()
  respondWith(
    apiStub({
      error: {
        url: '/api/ajustes/director',
        status: 400,
        code: 'bad_request',
        message: 'Invalid director settings',
        details: { ci: 'must be a cédula such as V-12345678' },
      },
    }),
  )
  try {
    const container = await mount()
    await dispatch(findAll(container, '[id="ajustes-director-form"]')[0], 'submit')
    await flush()

    const status = textOf(findAll(container, '[id="ajustes-director-status"]')[0])
    assert.equal(status.includes('Invalid'), false, 'the API message leaked to the screen')
    assert.match(status, /Revisa los datos/)

    const hints = findAll(container, '.field__error').map((node) => textOf(node)).filter(Boolean)
    assert.deepEqual(hints, ['Usa el formato V-12345678.'])
  } finally {
    stallFetch()
  }
})

test('a non-admin sees the stored values, cannot edit them, and gets no maintenance', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mount(DOCENTE)

    assert.equal(inputNamed(container, 'nombre').disabled, true)
    assert.equal(buttonWithText(container, 'Guardar director').disabled, true)
    assert.equal(findAll(container, '.ajustes__card--wide').length, 0)
    assert.equal(findAll(container, '.alert').length, 1)
    assert.match(textOf(findAll(container, '.alert')[0]), /Sólo un administrador/)
  } finally {
    stallFetch()
  }
})

test('reviewing lists the orphans and deleting asks first, then reports how many went', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mount()

    await dispatch(buttonWithText(container, 'Revisar huérfanos'), 'click')
    await flush()

    assert.match(textOf(findAll(container, '[id="ajustes-orphans-summary"]')[0]), /2 representante/)
    assert.equal(findAll(container, '.ajustes__orphan').length, 2)

    const purge = buttonWithText(container, 'Eliminar huérfanos')
    assert.equal(purge.disabled, false)

    await dispatch(purge, 'click')
    assert.equal(findAll(document.body, '.modal').length, 1, 'deleting without a confirmation')

    const confirm = findAll(document.body, '.modal .btn').find((button) => textOf(button) === 'Eliminar')
    await dispatch(confirm, 'click')
    await flush()

    const posted = calls.find((call) => call.method === 'POST' && call.url.endsWith('/purgar-representantes'))
    assert.ok(posted, 'the confirmation did not reach the purge endpoint')
    assert.equal(findAll(document.body, '.modal').length, 0)
    assert.match(textOf(findAll(container, '[id="ajustes-orphans-status"]')[0]), /Se eliminaron 2/)
  } finally {
    stallFetch()
  }
})

test('the backup reports the file it wrote', async () => {
  resetBody()
  respondWith(apiStub())
  try {
    const container = await mount()

    await dispatch(buttonWithText(container, 'Hacer backup'), 'click')
    await flush()

    const status = textOf(findAll(container, '[id="ajustes-backup-status"]')[0])
    assert.match(status, /backups\/fulgencia-2026-10-30-101500\.sql/)
    assert.match(status, /2 tablas/)
    // The settings are files: the dump alone does not hold the director or the logo.
    assert.match(status, /backups\/fulgencia-2026-10-30-101500\.datos/)
    assert.equal(buttonWithText(container, 'Hacer backup').disabled, false)
  } finally {
    stallFetch()
  }
})
