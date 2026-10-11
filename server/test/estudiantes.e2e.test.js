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

const clientDigest = (password) => crypto.createHash('sha256').update(password).digest('hex')

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    timer.unref()
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// Unique per run so repeated executions never collide with leftover rows.
// The base is 9 digits so any 2-digit offset keeps the total inside 1-12.
const uniqueCi = (offset = '') => String(Date.now()).slice(-9) + offset

test('estudiantes endpoints (require MariaDB and a configured .env)', async (t) => {
  if (!hasEnv) {
    return t.skip('Skipping estudiantes e2e: missing required env vars (.env at repo root)')
  }

  let db
  try {
    db = require('../src/config/db')
    await withTimeout(db.query('SELECT 1'), 5000)
  } catch (error) {
    return t.skip(`Skipping estudiantes e2e: database unreachable (${error.message})`)
  }

  const { createApp } = require('../src/app')
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
  let createdId = null
  let deletedId = null
  const createdRepCis = []
  const extraStudentIds = []

  t.after(async () => {
    // Best-effort cleanup: remove the student and any orphan representatives
    // this suite inserted, even when an assertion failed.
    if (createdId !== null && cookie) {
      try {
        await fetch(`${base}/api/estudiantes/${createdId}`, {
          method: 'DELETE',
          headers: { Cookie: cookie },
        })
      } catch {
        // Cleanup is best-effort; a failure here must not mask test results.
      }
    }
    for (const id of extraStudentIds) {
      if (!cookie) {
        break
      }
      try {
        await fetch(`${base}/api/estudiantes/${id}`, {
          method: 'DELETE',
          headers: { Cookie: cookie },
        })
      } catch {
        // Best-effort cleanup.
      }
    }
    for (const ci of createdRepCis) {
      try {
        await db.tabla('representantes').delete({ numero_ci: ci })
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

  const estudianteCi = uniqueCi()
  const repCiPrimary = uniqueCi('11')

  await t.test('rejects requests without a cookie with 401', async () => {
    const res = await fetch(`${base}/api/estudiantes`)
    assert.equal(res.status, 401)
  })

  await t.test('logs in the seeded admin and sets an auth cookie', async () => {
    const res = await login(clientDigest('admin123'))
    assert.equal(res.status, 200)
    const setCookies = res.headers.getSetCookie()
    const tokenCookie = setCookies.find((value) => value.startsWith('fulgencia_token='))
    assert.ok(tokenCookie, 'expected a fulgencia_token Set-Cookie header')
    cookie = tokenCookie.split(';')[0]
  })

  await t.test('rejects an invalid cédula with 400', async () => {
    const res = await api('POST', '/api/estudiantes', {
      estudiante: {
        tipo_ci: 'V',
        numero_ci: 'abc',
        primer_nombre: 'María',
        primer_apellido: 'Pérez',
        fecha_nacimiento: '2012-04-10',
        sexo: 'F',
      },
      inscripcion: {
        anio_escolar: '2025-2026',
        anio: '1er Año',
        seccion: 'A',
        fecha_inscripcion: '2025-09-15',
      },
      representantes: [{ tipo_ci: 'V', numero_ci: repCiPrimary, nombre: 'Ana Pérez', parentesco: 'Madre' }],
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'bad_request')
    assert.equal(body.details.numero_ci, 'must be 1-12 digits')
  })

  await t.test('creates a student with inscription, documents and representatives', async () => {
    const res = await api('POST', '/api/estudiantes', {
      estudiante: {
        tipo_ci: 'V',
        numero_ci: estudianteCi,
        primer_nombre: 'María',
        segundo_nombre: 'Isabel',
        primer_apellido: 'Pérez',
        segundo_apellido: 'Rojas',
        fecha_nacimiento: '2012-04-10',
        sexo: 'F',
        telefono: '0412-5551234',
        correo: 'maria.perez@example.com',
      },
      inscripcion: {
        anio_escolar: '2025-2026',
        anio: '1er Año',
        seccion: 'A',
        fecha_inscripcion: '2025-09-15',
        regular: true,
        repite: false,
      },
      representantes: [
        { tipo_ci: 'V', numero_ci: repCiPrimary, nombre: 'Ana Pérez', parentesco: 'Madre' },
      ],
      documentos: { partida_nacimiento: true, copia_cedula: true },
    })
    assert.equal(res.status, 201)

    const body = await res.json()
    assert.equal(body.estudiante.id, body.estudiante.id)
    assert.equal(body.estudiante.numero_ci, estudianteCi)
    assert.equal(body.estudiante.primer_nombre, 'María')
    assert.equal(body.estudiante.telefono, '0412-5551234')
    createdId = body.estudiante.id
    createdRepCis.push(repCiPrimary)

    assert.equal(body.inscripciones.length, 1)
    assert.equal(body.inscripciones[0].anio, '1er Año')
    assert.equal(body.inscripciones[0].seccion, 'A')
    assert.equal(body.inscripciones[0].anio_escolar, '2025-2026')
    assert.equal(body.inscripciones[0].regular, 1)
    assert.equal(body.inscripciones[0].documentos.partida_nacimiento, 1)
    assert.equal(body.inscripciones[0].documentos.carpeta, 0)

    assert.equal(body.representantes.length, 1)
    assert.equal(body.representantes[0].numero_ci, repCiPrimary)
    assert.equal(body.representantes[0].parentesco, 'Madre')
  })

  await t.test('rejects a duplicate cédula with 409', async () => {
    const res = await api('POST', '/api/estudiantes', {
      estudiante: {
        tipo_ci: 'V',
        numero_ci: estudianteCi,
        primer_nombre: 'Otro',
        primer_apellido: 'Nombre',
        fecha_nacimiento: '2013-01-05',
        sexo: 'M',
      },
      inscripcion: {
        anio_escolar: '2025-2026',
        anio: '1er Año',
        seccion: 'B',
        fecha_inscripcion: '2025-09-15',
      },
      representantes: [{ tipo_ci: 'V', numero_ci: repCiPrimary, nombre: 'Ana Pérez', parentesco: 'Madre' }],
    })
    assert.equal(res.status, 409)
    const body = await res.json()
    assert.equal(body.code, 'conflict')
  })

  await t.test('rejects an invalid section for the year with 400', async () => {
    const res = await api('POST', '/api/estudiantes', {
      estudiante: {
        tipo_ci: 'E',
        numero_ci: uniqueCi('22'),
        primer_nombre: 'Sección',
        primer_apellido: 'Inválida',
        fecha_nacimiento: '2013-01-05',
        sexo: 'M',
      },
      inscripcion: {
        anio_escolar: '2025-2026',
        anio: '3er Año',
        seccion: 'F',
        fecha_inscripcion: '2025-09-15',
      },
      representantes: [{ tipo_ci: 'V', numero_ci: repCiPrimary, nombre: 'Ana Pérez', parentesco: 'Madre' }],
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'bad_request')
    assert.equal(body.details.seccion, 'invalid section for the year')
  })

  await t.test('lists students and finds the created one via the q filter', async () => {
    const res = await api('GET', `/api/estudiantes?q=${encodeURIComponent(estudianteCi)}`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(Array.isArray(body.estudiantes))

    const found = body.estudiantes.find((student) => student.id === createdId)
    assert.ok(found, 'expected the created student in the q-filtered list')
    assert.equal(found.anio, '1er Año')
    assert.equal(found.seccion, 'A')
    assert.equal(found.anio_escolar, '2025-2026')
  })

  await t.test('filters the list by anio and seccion', async () => {
    const res = await api(
      'GET',
      `/api/estudiantes?anio=${encodeURIComponent('1er Año')}&seccion=A`,
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    const found = body.estudiantes.find((student) => student.id === createdId)
    assert.ok(found, 'expected the created student in the anio-filtered list')
  })

  await t.test('filters the list by seccion alone', async () => {
    // A student in a different section must be excluded when only `seccion` is
    // supplied: the set restriction must not depend on `anio` being present.
    const sectionCi = uniqueCi('44')
    const sectionRepCi = uniqueCi('55')
    const create = await api('POST', '/api/estudiantes', {
      estudiante: {
        tipo_ci: 'V',
        numero_ci: sectionCi,
        primer_nombre: 'Sección',
        primer_apellido: 'Solo',
        fecha_nacimiento: '2012-05-05',
        sexo: 'F',
      },
      inscripcion: {
        anio_escolar: '2025-2026',
        anio: '2do Año',
        seccion: 'C',
        fecha_inscripcion: '2025-09-15',
      },
      representantes: [
        { tipo_ci: 'V', numero_ci: sectionRepCi, nombre: 'Rep Sección', parentesco: 'Madre' },
      ],
    })
    assert.equal(create.status, 201)
    const sectionStudent = await create.json()
    const sectionStudentId = sectionStudent.estudiante.id
    extraStudentIds.push(sectionStudentId)
    createdRepCis.push(sectionRepCi)

    const res = await api('GET', '/api/estudiantes?seccion=C')
    assert.equal(res.status, 200)
    const body = await res.json()
    const ids = body.estudiantes.map((student) => student.id)
    assert.ok(ids.includes(sectionStudentId), 'expected the section C student in the list')
    assert.ok(
      !ids.includes(createdId),
      'expected the section A student to be excluded by the seccion filter',
    )
  })

  await t.test('the list q filter excludes non-matching students', async () => {
    const res = await api('GET', `/api/estudiantes?q=${encodeURIComponent(`zzqx-${estudianteCi}`)}`)
    assert.equal(res.status, 200)
    const body = await res.json()
    const found = body.estudiantes.find((student) => student.id === createdId)
    assert.equal(found, undefined)
  })

  await t.test('returns the full record by id', async () => {
    const res = await api('GET', `/api/estudiantes/${createdId}`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.estudiante.id, createdId)
    assert.equal(body.inscripciones.length, 1)
    assert.equal(body.inscripciones[0].documentos.partida_nacimiento, 1)
    assert.equal(body.representantes[0].parentesco, 'Madre')
  })

  await t.test('rejects changing the cédula with 400', async () => {
    const res = await api('PUT', `/api/estudiantes/${createdId}`, {
      estudiante: { numero_ci: '999999999999' },
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'bad_request')
  })

  await t.test('updates student fields, inscription and documents', async () => {
    const res = await api('PUT', `/api/estudiantes/${createdId}`, {
      estudiante: { primer_nombre: 'María José' },
      inscripcion: { anio_escolar: '2025-2026', seccion: 'B', repite: true },
      documentos: { carpeta: true },
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.estudiante.primer_nombre, 'María José')
    assert.equal(body.estudiante.numero_ci, estudianteCi)
    assert.equal(body.inscripciones[0].seccion, 'B')
    assert.equal(body.inscripciones[0].repite, 1)
    assert.equal(body.inscripciones[0].documentos.carpeta, 1)
    assert.equal(body.inscripciones[0].documentos.partida_nacimiento, 1)
  })

  await t.test('reconciles representatives on update', async () => {
    const repCiSecondary = uniqueCi('33')
    createdRepCis.push(repCiSecondary)

    // Replace the primary representative with a secondary one.
    const res = await api('PUT', `/api/estudiantes/${createdId}`, {
      representantes: [
        { tipo_ci: 'V', numero_ci: repCiSecondary, nombre: 'Pedro Pérez', parentesco: 'Padre' },
      ],
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.representantes.length, 1)
    assert.equal(body.representantes[0].numero_ci, repCiSecondary)
    assert.equal(body.representantes[0].parentesco, 'Padre')
  })

  await t.test('removes every representative link when the list is emptied', async () => {
    const res = await api('PUT', `/api/estudiantes/${createdId}`, { representantes: [] })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.representantes.length, 0)
  })

  await t.test('returns 404 for an unknown student', async () => {
    const res = await api('GET', '/api/estudiantes/999999999')
    assert.equal(res.status, 404)
    const body = await res.json()
    assert.equal(body.code, 'not_found')
  })

  await t.test('deletes the student', async () => {
    const res = await api('DELETE', `/api/estudiantes/${createdId}`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
    deletedId = createdId
    createdId = null // already cleaned up
  })

  await t.test('returns 404 after deletion', async () => {
    const res = await api('GET', `/api/estudiantes/${deletedId}`)
    assert.equal(res.status, 404)
  })
})