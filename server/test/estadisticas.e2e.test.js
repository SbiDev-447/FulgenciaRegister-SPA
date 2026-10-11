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

// Unique per run; the offset keeps the three fixture CIs distinct.
const uniqueCi = (offset) => String(Date.now()).slice(-9) + offset

const YEAR_LABELS = ['1er Año', '2do Año', '3er Año', '4to Año', '5to Año']
// Isolated year/section: no other suite uses section E, so the fixture's
// contribution can be measured as a delta over a baseline snapshot.
const ANIO = '2do Año'
const SECCION = 'E'
const ANIO_ESCOLAR = '2026-2027'

test('estadisticas endpoint (require MariaDB and a configured .env)', async (t) => {
  if (!hasEnv) {
    return t.skip('Skipping estadisticas e2e: missing required env vars (.env at repo root)')
  }

  let db
  try {
    db = require('../src/config/db')
    await withTimeout(db.query('SELECT 1'), 5000)
  } catch (error) {
    return t.skip(`Skipping estadisticas e2e: database unreachable (${error.message})`)
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
  let before = null
  const createdStudentIds = []

  t.after(async () => {
    // Best-effort cleanup: deleting the students cascades to their inscriptions
    // and emitted documents, even if an assertion failed earlier.
    for (const id of createdStudentIds) {
      try {
        await db.tabla('estudiantes').delete({ id })
      } catch {
        // Cleanup is best-effort; a failure here must not mask test results.
      }
    }
    await new Promise((resolve) => server.close(resolve))
    db.end()
  })

  const api = (method, url) =>
    fetch(`${base}${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
    })

  const filteredUrl = `/api/estadisticas?anio=${encodeURIComponent(ANIO)}&seccion=${SECCION}`

  await t.test('rejects requests without a cookie with 401', async () => {
    const res = await fetch(`${base}/api/estadisticas`)
    assert.equal(res.status, 401)
  })

  await t.test('logs in the seeded admin and sets an auth cookie', async () => {
    const res = await login(clientDigest('admin123'))
    assert.equal(res.status, 200)
    const tokenCookie = res.headers.getSetCookie().find((value) => value.startsWith('fulgencia_token='))
    assert.ok(tokenCookie, 'expected a fulgencia_token Set-Cookie header')
    cookie = tokenCookie.split(';')[0]
  })

  await t.test('captures a baseline for the isolated filter', async () => {
    const res = await api('GET', filteredUrl)
    assert.equal(res.status, 200)
    before = await res.json()
    assert.deepEqual(before.filtros, { anio: ANIO, seccion: SECCION })
    assert.equal(before.porAnio.length, YEAR_LABELS.length)
  })

  await t.test('seeds a deterministic fixture', async () => {
    // Three students, one inscription each, all inside the isolated filter.
    const fixtures = [
      { nombre: 'Ana', apellido: 'Uno', sexo: 'F', offset: '01' },
      { nombre: 'Beto', apellido: 'Dos', sexo: 'M', offset: '02' },
      { nombre: 'Carla', apellido: 'Tres', sexo: 'F', offset: '03' },
    ]
    for (const fixture of fixtures) {
      const insert = await db.tabla('estudiantes').insert({
        tipo_ci: 'V',
        numero_ci: uniqueCi(fixture.offset),
        primer_nombre: fixture.nombre,
        primer_apellido: fixture.apellido,
        fecha_nacimiento: '2012-04-10',
        sexo: fixture.sexo,
      })
      const id = insert.insertId
      createdStudentIds.push(id)
      await db.tabla('inscripciones').insert({
        estudiante_id: id,
        anio_escolar: ANIO_ESCOLAR,
        anio: ANIO,
        seccion: SECCION,
        fecha_inscripcion: '2026-09-15',
      })
    }

    // Two emitted documents belonging to the filtered set.
    for (let i = 0; i < 2; i += 1) {
      await db.tabla('documentos_emitidos').insert({
        estudiante_id: createdStudentIds[i],
        tipo: 'constancia_estudio',
      })
    }
  })

  await t.test('reports the three cards for the filtered view', async () => {
    const res = await api('GET', filteredUrl)
    assert.equal(res.status, 200)
    const after = await res.json()

    assert.equal(after.estudiantes.total - before.estudiantes.total, 3)
    assert.equal(after.estudiantes.mujeres - before.estudiantes.mujeres, 2)
    assert.equal(after.estudiantes.hombres - before.estudiantes.hombres, 1)
    assert.equal(after.documentosEmitidos - before.documentosEmitidos, 2)

    // The counts must stay internally consistent.
    assert.equal(
      after.estudiantes.total,
      after.estudiantes.mujeres + after.estudiantes.hombres,
    )
  })

  await t.test('reports porAnio in YEARS order and scoped by section only', async () => {
    const res = await api('GET', filteredUrl)
    const after = await res.json()

    assert.deepEqual(
      after.porAnio.map((entry) => entry.anio),
      YEAR_LABELS,
    )

    const beforeYear = before.porAnio.find((entry) => entry.anio === ANIO)
    const afterYear = after.porAnio.find((entry) => entry.anio === ANIO)
    assert.equal(afterYear.total - beforeYear.total, 3)
    assert.equal(afterYear.mujeres - beforeYear.mujeres, 2)
    assert.equal(afterYear.hombres - beforeYear.hombres, 1)

    // Every other year is untouched by the fixture.
    for (const entry of after.porAnio) {
      if (entry.anio === ANIO) {
        continue
      }
      const reference = before.porAnio.find((other) => other.anio === entry.anio)
      assert.deepEqual(entry, reference)
    }
  })

  await t.test('returns the cards without filters', async () => {
    const res = await api('GET', '/api/estadisticas')
    assert.equal(res.status, 200)
    const body = await res.json()

    assert.deepEqual(body.filtros, { anio: null, seccion: null })
    assert.equal(typeof body.estudiantes.total, 'number')
    assert.equal(typeof body.estudiantes.mujeres, 'number')
    assert.equal(typeof body.estudiantes.hombres, 'number')
    assert.equal(typeof body.documentosEmitidos, 'number')
    assert.equal(body.porAnio.length, YEAR_LABELS.length)
  })

  await t.test('accepts a section A-F when no year is given', async () => {
    const res = await api('GET', '/api/estadisticas?seccion=F')
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body.filtros, { anio: null, seccion: 'F' })
  })

  await t.test('rejects an unknown year label with 400', async () => {
    const res = await api('GET', `/api/estadisticas?anio=${encodeURIComponent('6to Año')}`)
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'bad_request')
  })

  await t.test('rejects a section invalid for the given year with 400', async () => {
    const res = await api('GET', `/api/estadisticas?anio=${encodeURIComponent('3er Año')}&seccion=F`)
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'bad_request')
  })
})
