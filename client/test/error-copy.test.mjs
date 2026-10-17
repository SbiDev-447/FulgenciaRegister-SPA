// A rejection must reach the screen as Spanish copy, never as the API `message`.
//
// `server/src/utils/httpError.js` states the contract: `code` is what the client
// localizes, and `message` stays English for logs and tooling. These tests drive
// the real views with simulated rejections and assert the text a person reads
// (S14), so the leak that put "Invalid credentials" on the sign-in cannot return
// quietly.

import test from 'node:test'
import assert from 'node:assert/strict'
import { installDom, makeEl, findAll, textOf, dispatch, respondWith, stallFetch } from './dom-stub.mjs'
import { errorCopy } from '../js/ui/messages.js'

installDom()

test('errorCopy resolves the code, then the status, then the call-site fallback', () => {
  assert.equal(errorCopy({ code: 'not_found', status: 418 }), 'No se encontró el registro solicitado.')
  assert.equal(errorCopy({ code: 'rate_limited', status: 500 }, 'No se pudieron cargar los estudiantes.'), 'Ocurrió un error en el servidor.')
  assert.equal(errorCopy({ code: 'rate_limited', status: 429 }, 'No se pudieron cargar los estudiantes.'), 'No se pudieron cargar los estudiantes.')
  assert.equal(errorCopy(null, 'No se pudo cargar la ficha.'), 'No se pudo cargar la ficha.')
  assert.equal(errorCopy(undefined), 'Ocurrió un error inesperado.')
})

test('errorCopy returns a string for any code, including inherited object keys', () => {
  // A plain object literal inherits `constructor` and friends: without
  // Object.hasOwn this would hand a function over to textContent.
  for (const code of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    assert.equal(errorCopy({ code }, 'No se pudo cargar.'), 'No se pudo cargar.')
  }
})

test('a network rejection is Spanish, never the browser text', () => {
  assert.equal(errorCopy({ code: 'network_error', status: 0 }, 'No se pudo cargar.'), 'No se pudo conectar con el servidor.')
})

test('the login shows one generic Spanish message for any 401 (no enumeration)', async () => {
  const { renderLogin } = await import('../js/views/login.js')

  // The server answers the same 401 for an unknown user and for a bad password,
  // so the copy must not hint at which half failed.
  for (const message of ['Invalid credentials', 'Not authenticated']) {
    respondWith(async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ code: 'unauthorized', message }),
    }))

    try {
      const container = makeEl('div')
      renderLogin(container, { onSuccess: () => { throw new Error('unexpected success') } })

      const form = findAll(container, 'form')[0]
      form.elements.usuario.value = 'admin'
      form.elements.password.value = 'admin123'
      await dispatch(form, 'submit')

      const alert = findAll(container, '.alert')[0]
      assert.equal(alert.hidden, false, 'the rejection was not shown')
      assert.equal(textOf(alert), 'Usuario o contraseña incorrectos.')
    } finally {
      stallFetch()
    }
  }
})

test('other login failures stay readable Spanish', async () => {
  const { renderLogin } = await import('../js/views/login.js')

  const cases = [
    [
      async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ code: 'internal_error', message: 'Unexpected server error' }) }),
      'Ocurrió un error en el servidor.',
    ],
    [async () => { throw new TypeError('fetch failed') }, 'No se pudo conectar con el servidor.'],
  ]

  for (const [impl, expected] of cases) {
    respondWith(impl)

    try {
      const container = makeEl('div')
      renderLogin(container, { onSuccess: () => {} })

      const form = findAll(container, 'form')[0]
      form.elements.usuario.value = 'admin'
      form.elements.password.value = 'admin123'
      await dispatch(form, 'submit')

      assert.equal(textOf(findAll(container, '.alert')[0]), expected)
    } finally {
      stallFetch()
    }
  }
})
