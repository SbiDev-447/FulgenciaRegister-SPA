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

// Unique per run; the offset keeps the fixture CIs distinct.
const uniqueCi = (offset) => String(Date.now()).slice(-9) + offset

// Isolated grade/section/year: no other suite prints this group, so the roster
// can be measured as an exact set instead of a delta over seeded data.
const ANIO = '3er Año'
const SECCION = 'E'
const ANIO_ESCOLAR = '2031-2032'
const ANIO_ESCOLAR_ANTERIOR = '2030-2031'

test('reportes endpoint (require MariaDB and a configured .env)', async (t) => {
  if (!hasEnv) {
    return t.skip('Skipping reportes e2e: missing required env vars (.env at repo root)')
  }

  let db
  try {
    db = require('../src/config/db')
    await withTimeout(db.query('SELECT 1'), 5000)
  } catch (error) {
    return t.skip(`Skipping reportes e2e: database unreachable (${error.message})`)
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
  const createdStudentIds = []

  t.after(async () => {
    // Best-effort cleanup: deleting the students cascades to their inscriptions.
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

  async function createStudent(apellido, nombre, offset) {
    const insert = await db.tabla('estudiantes').insert({
      tipo_ci: 'V',
      numero_ci: uniqueCi(offset),
      primer_nombre: nombre,
      primer_apellido: apellido,
      fecha_nacimiento: '2010-06-15',
      sexo: 'F',
      telefono: '0414-5550000',
      correo: `reportes-${offset}@ejemplo.com`,
    })
    const id = insert.insertId
    createdStudentIds.push(id)
    return id
  }

  async function enroll(studentId, { anio = ANIO, seccion = SECCION, anioEscolar = ANIO_ESCOLAR } = {}) {
    await db.tabla('inscripciones').insert({
      estudiante_id: studentId,
      anio_escolar: anioEscolar,
      anio,
      seccion,
      fecha_inscripcion: '2026-09-15',
    })
  }

  const urlFor = (params = {}) => {
    const query = new URLSearchParams({ anio: ANIO, seccion: SECCION, ...params })
    return `/api/reportes/seccion?${query.toString()}`
  }

  await t.test('rejects requests without a cookie with 401', async () => {
    const res = await fetch(`${base}/api/reportes/seccion?anio=${encodeURIComponent(ANIO)}&seccion=${SECCION}`)
    assert.equal(res.status, 401)
  })

  await t.test('logs in the seeded admin and sets an auth cookie', async () => {
    const res = await login(clientDigest('admin123'))
    assert.equal(res.status, 200)
    const tokenCookie = res.headers.getSetCookie().find((value) => value.startsWith('fulgencia_token='))
    assert.ok(tokenCookie, 'expected a fulgencia_token Set-Cookie header')
    cookie = tokenCookie.split(';')[0]
  })

  await t.test('seeds a roster with an older repeated year and an outsider', async () => {
    // Insertion order is deliberately not alphabetical: the endpoint sorts.
    const zuniga = await createStudent('Zúñiga', 'Ana', '11')
    const alvarez = await createStudent('Álvarez', 'Beto', '12')
    const bravo = await createStudent('Bravo', 'Carla', '13')
    const outsider = await createStudent('Nadie', 'Daniel', '14')

    await enroll(zuniga)
    await enroll(alvarez)
    await enroll(bravo)
    // The same student repeated 3er Año in the previous school year: the report
    // must print one cohort, not the same person twice.
    await enroll(alvarez, { anioEscolar: ANIO_ESCOLAR_ANTERIOR })
    // A different section never leaks into the sheet.
    await enroll(outsider, { seccion: 'A' })
  })

  await t.test('returns the whole section sorted by last name', async () => {
    const res = await api('GET', urlFor())
    assert.equal(res.status, 200)
    const body = await res.json()

    assert.deepEqual(body.filtros, {
      anio: ANIO,
      seccion: SECCION,
      anio_escolar: ANIO_ESCOLAR,
    })
    assert.equal(body.total, 3)
    assert.deepEqual(
      body.estudiantes.map((student) => student.primer_apellido),
      ['Álvarez', 'Bravo', 'Zúñiga'],
    )
    // The repeated student appears once.
    assert.equal(
      body.estudiantes.filter((student) => student.primer_apellido === 'Álvarez').length,
      1,
    )

    for (const student of body.estudiantes) {
      assert.ok(student.id > 0)
      assert.equal(typeof student.primer_nombre, 'string')
      assert.equal(typeof student.numero_ci, 'string')
      assert.ok(['M', 'F'].includes(student.sexo))
      assert.equal(student.telefono, '0414-5550000')
      assert.match(student.correo, /^reportes-\d+@ejemplo\.com$/)
    }
  })

  await t.test('pins an older school year when anio_escolar is given', async () => {
    const res = await api('GET', urlFor({ anio_escolar: ANIO_ESCOLAR_ANTERIOR }))
    assert.equal(res.status, 200)
    const body = await res.json()

    assert.deepEqual(body.filtros, {
      anio: ANIO,
      seccion: SECCION,
      anio_escolar: ANIO_ESCOLAR_ANTERIOR,
    })
    assert.equal(body.total, 1)
    assert.equal(body.estudiantes[0].primer_apellido, 'Álvarez')
  })

  await t.test('rejects a missing grade or section with 400', async () => {
    const missing = await api('GET', `/api/reportes/seccion?seccion=${SECCION}`)
    assert.equal(missing.status, 400)
    assert.equal((await missing.json()).code, 'bad_request')

    const noSection = await api('GET', `/api/reportes/seccion?anio=${encodeURIComponent(ANIO)}`)
    assert.equal(noSection.status, 400)
  })

  await t.test('rejects a section invalid for the year with 400', async () => {
    const res = await api(
      'GET',
      `/api/reportes/seccion?anio=${encodeURIComponent('3er Año')}&seccion=F`,
    )
    assert.equal(res.status, 400)
    assert.equal((await res.json()).code, 'bad_request')
  })

  await t.test('rejects an unknown year label with 400', async () => {
    const res = await api(
      'GET',
      `/api/reportes/seccion?anio=${encodeURIComponent('6to Año')}&seccion=A`,
    )
    assert.equal(res.status, 400)
  })

  await t.test('rejects a malformed anio_escolar with 400', async () => {
    const res = await api('GET', urlFor({ anio_escolar: '2031' }))
    assert.equal(res.status, 400)
    assert.equal((await res.json()).code, 'bad_request')
  })
})
