'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')

// The test runner does not load .env automatically, so mirror the npm scripts
// (`--env-file-if-exists=../.env`). If the file is absent or incomplete the
// suite skips instead of failing.
const envFile = path.resolve(__dirname, '..', '..', '.env')
if (fs.existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile)
  } catch {
    // Ignore malformed env files; the required-var check below decides.
  }
}

const REQUIRED_ENV = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET']
const hasEnv = REQUIRED_ENV.every((key) => Boolean(process.env[key]))

// Load the app at import time (when env is present) so a missing route module
// fails the suite loudly instead of being masked by the DB-unreachable skip.
const createApp = hasEnv ? require('../src/app').createApp : null

const clientDigest = (password) => crypto.createHash('sha256').update(password).digest('hex')

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    timer.unref()
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// Unique per run; digits only, inside the 1-12 range the cédula expects.
const uniqueCi = () => String(Date.now()).slice(-9)

test('documentos endpoints (require MariaDB and a configured .env)', async (t) => {
  if (!hasEnv) {
    return t.skip('Skipping documentos e2e: missing required env vars (.env at repo root)')
  }

  let db
  try {
    db = require('../src/config/db')
    await withTimeout(db.query('SELECT 1'), 5000)
  } catch (error) {
    return t.skip(`Skipping documentos e2e: database unreachable (${error.message})`)
  }

  const server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))

  const base = `http://127.0.0.1:${server.address().port}`
  const login = (password) =>
    fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'admin', password }),
    })

  let cookie
  let studentId = null
  let emittedId = null
  let adminId = null
  const ci = uniqueCi()

  t.after(async () => {
    // Best-effort cleanup: deleting the student cascades to its inscriptions
    // and emitted documents, even if an assertion failed earlier.
    if (studentId !== null) {
      try {
        await db.tabla('estudiantes').delete({ id: studentId })
      } catch {
        // Cleanup is best-effort; a failure here must not mask test results.
      }
    }
    if (emittedId !== null) {
      try {
        await db.tabla('documentos_emitidos').delete({ id: emittedId })
      } catch {
        // Best-effort cleanup.
      }
    }
    await new Promise((resolve) => server.close(resolve))
    db.end()
  })

  const api = (method, url, body) =>
    fetch(`${base}${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  await t.test('rejects requests without a cookie with 401', async () => {
    const verify = await fetch(`${base}/api/documentos/verificar/V-${ci}`)
    assert.equal(verify.status, 401)

    const emit = await fetch(`${base}/api/documentos/emitir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'constancia_estudio', estudiante_id: 1 }),
    })
    assert.equal(emit.status, 401)
  })

  await t.test('logs in the seeded admin and sets an auth cookie', async () => {
    const res = await login(clientDigest('admin123'))
    assert.equal(res.status, 200)
    const tokenCookie = res.headers.getSetCookie().find((value) => value.startsWith('fulgencia_token='))
    assert.ok(tokenCookie, 'expected a fulgencia_token Set-Cookie header')
    cookie = tokenCookie.split(';')[0]

    const admin = await db.tabla('usuarios').selectOne(null, null, { usuario: 'admin' })
    adminId = admin.id
  })

  await t.test('seeds the student fixture directly in the database', async () => {
    const insert = await db.tabla('estudiantes').insert({
      tipo_ci: 'V',
      numero_ci: ci,
      primer_nombre: 'Ana',
      primer_apellido: 'Pérez',
      fecha_nacimiento: '2012-04-10',
      sexo: 'F',
    })
    studentId = insert.insertId
    await db.tabla('inscripciones').insert({
      estudiante_id: studentId,
      anio_escolar: '2026-2027',
      anio: '4to Año',
      seccion: 'B',
      fecha_inscripcion: '2026-09-15',
    })
  })

  await t.test('verifies a student by a dashed, uppercased cédula', async () => {
    const res = await api('GET', `/api/documentos/verificar/V-${ci}`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body.estudiante, {
      id: studentId,
      tipo_ci: 'V',
      numero_ci: ci,
      primer_nombre: 'Ana',
      primer_apellido: 'Pérez',
      nombre_completo: 'Ana Pérez',
      anio: '4to Año',
      seccion: 'B',
      anio_escolar: '2026-2027',
    })
  })

  await t.test('accepts the same cédula without a dash and lowercased', async () => {
    const res = await api('GET', `/api/documentos/verificar/v${ci}`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.estudiante.id, studentId)
    assert.equal(body.estudiante.numero_ci, ci)
  })

  await t.test('returns 404 for an unknown cédula', async () => {
    const res = await api('GET', '/api/documentos/verificar/V-999999999999')
    assert.equal(res.status, 404)
    const body = await res.json()
    assert.equal(body.code, 'not_found')
  })

  await t.test('rejects a malformed cédula with 400', async () => {
    const res = await api('GET', '/api/documentos/verificar/V-abc')
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'bad_request')
  })

  await t.test('emits a document, persists the row and records the user', async () => {
    const res = await api('POST', '/api/documentos/emitir', {
      tipo: 'constancia_estudio',
      estudiante_id: studentId,
    })
    assert.equal(res.status, 201)
    const body = await res.json()

    assert.equal(body.documento.tipo, 'constancia_estudio')
    assert.equal(body.documento.estudiante_id, studentId)
    assert.equal(body.documento.usuario_id, adminId)
    assert.ok(body.documento.id > 0)
    assert.ok(body.documento.fecha_emision, 'expected a DB-provided fecha_emision')

    assert.equal(body.estudiante.id, studentId)
    assert.equal(body.estudiante.nombre_completo, 'Ana Pérez')
    assert.equal(body.estudiante.anio_escolar, '2026-2027')

    const row = await db.tabla('documentos_emitidos').selectOne(null, null, { id: body.documento.id })
    assert.ok(row, 'expected the emitted document to be persisted')
    assert.equal(row.tipo, 'constancia_estudio')
    assert.equal(row.usuario_id, adminId)
    emittedId = body.documento.id
  })

  await t.test('rejects an invalid tipo with 400 and details', async () => {
    const res = await api('POST', '/api/documentos/emitir', {
      tipo: 'no_existe',
      estudiante_id: studentId,
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'bad_request')
    assert.ok(body.details.tipo, 'expected a tipo detail')
  })

  await t.test('rejects a missing estudiante_id with 400 and details', async () => {
    const res = await api('POST', '/api/documentos/emitir', { tipo: 'constancia_estudio' })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'bad_request')
    assert.ok(body.details.estudiante_id, 'expected an estudiante_id detail')
  })

  await t.test('rejects a non-integer estudiante_id with 400', async () => {
    const res = await api('POST', '/api/documentos/emitir', {
      tipo: 'constancia_estudio',
      estudiante_id: -5,
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'bad_request')
  })

  await t.test('returns 404 when emitting for an unknown student', async () => {
    const res = await api('POST', '/api/documentos/emitir', {
      tipo: 'constancia_estudio',
      estudiante_id: 999999999,
    })
    assert.equal(res.status, 404)
    const body = await res.json()
    assert.equal(body.code, 'not_found')
  })
})
