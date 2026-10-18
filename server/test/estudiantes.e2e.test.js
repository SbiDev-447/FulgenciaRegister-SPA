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

// Consigning every document is required to enroll a student: primary school is
// grades 1-6, and entering the liceo (1st year of secondary) requires the 6th
// grade certificate, so every enrolled student can hand the full set in. The
// rule itself is asserted by its own test.
const allDocumentos = {
  partida_nacimiento: true,
  copia_cedula: true,
  boleta: true,
  fotos: true,
  carpeta: true,
  certificado_6to_grado: true,
}

// Every create requires these beyond the identity fields, so each payload
// spreads them first and keeps its own case the only possible failure.
const contactoObligatorio = {
  segundo_nombre: 'Isabel',
  segundo_apellido: 'Rojas',
  telefono: '0412-5551234',
  correo: 'correo@ejemplo.com',
  pais_nacimiento: 'Venezuela',
  estado_nacimiento: 'Miranda',
  municipio_nacimiento: 'Sucre',
  lateralidad: 'Derecha',
}

// Every representative requires a phone and an email, so each payload spreads
// these first and keeps its own case the only possible failure.
const repObligatorio = {
  telefono: '0414-5559876',
  correo: 'representante@ejemplo.com',
}

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
        ...contactoObligatorio,
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
      representantes: [{ ...repObligatorio, tipo_ci: 'V', numero_ci: repCiPrimary, nombre: 'Ana Pérez', parentesco: 'Madre' }],
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'bad_request')
    assert.equal(body.details.numero_ci, 'must be 1-12 digits')
  })

  await t.test('rejects a student missing the required contact fields with 400', async () => {
    const res = await api('POST', '/api/estudiantes', {
      estudiante: {
        tipo_ci: 'V',
        numero_ci: uniqueCi('66'),
        primer_nombre: 'Sin',
        primer_apellido: 'Contacto',
        fecha_nacimiento: '2012-04-10',
        sexo: 'F',
      },
      inscripcion: {
        anio_escolar: '2025-2026',
        anio: '1er Año',
        seccion: 'A',
        fecha_inscripcion: '2025-09-15',
      },
      representantes: [{ ...repObligatorio, tipo_ci: 'V', numero_ci: repCiPrimary, nombre: 'Ana Pérez', parentesco: 'Madre' }],
      documentos: { ...allDocumentos },
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'bad_request')
    assert.deepEqual(body.details, {
      segundo_nombre: 'is required',
      segundo_apellido: 'is required',
      telefono: 'is required',
      correo: 'is required',
      pais_nacimiento: 'is required',
      estado_nacimiento: 'is required',
      municipio_nacimiento: 'is required',
      lateralidad: 'is required',
    })
  })

  await t.test('rejects a representative missing the phone with 400', async () => {
    const repCi = uniqueCi('81')
    const res = await api('POST', '/api/estudiantes', {
      estudiante: {
        ...contactoObligatorio,
        tipo_ci: 'V',
        numero_ci: uniqueCi('77'),
        primer_nombre: 'Rep',
        primer_apellido: 'Sin Teléfono',
        fecha_nacimiento: '2012-04-10',
        sexo: 'F',
      },
      inscripcion: {
        anio_escolar: '2025-2026',
        anio: '1er Año',
        seccion: 'A',
        fecha_inscripcion: '2025-09-15',
      },
      representantes: [
        { tipo_ci: 'V', numero_ci: repCi, nombre: 'Ana Pérez', parentesco: 'Madre', correo: 'rep@ejemplo.com' },
      ],
      documentos: { ...allDocumentos },
    })
    const body = await res.json()
    // Before the rule exists the record is created instead of rejected, so
    // register it for cleanup first: a red run must not leave rows behind.
    if (body.estudiante) {
      extraStudentIds.push(body.estudiante.id)
      createdRepCis.push(repCi)
    }
    assert.equal(res.status, 400)
    assert.deepEqual(body.details, { telefono: 'is required' })
  })

  await t.test('rejects a representative missing the email with 400', async () => {
    const repCi = uniqueCi('82')
    const res = await api('POST', '/api/estudiantes', {
      estudiante: {
        ...contactoObligatorio,
        tipo_ci: 'V',
        numero_ci: uniqueCi('78'),
        primer_nombre: 'Rep',
        primer_apellido: 'Sin Correo',
        fecha_nacimiento: '2012-04-10',
        sexo: 'F',
      },
      inscripcion: {
        anio_escolar: '2025-2026',
        anio: '1er Año',
        seccion: 'A',
        fecha_inscripcion: '2025-09-15',
      },
      representantes: [
        { tipo_ci: 'V', numero_ci: repCi, nombre: 'Ana Pérez', parentesco: 'Madre', telefono: '0414-5559876' },
      ],
      documentos: { ...allDocumentos },
    })
    const body = await res.json()
    // See the note on the phone case above.
    if (body.estudiante) {
      extraStudentIds.push(body.estudiante.id)
      createdRepCis.push(repCi)
    }
    assert.equal(res.status, 400)
    assert.deepEqual(body.details, { correo: 'is required' })
  })

  await t.test('still accepts a representative without parentesco', async () => {
    const repCi = uniqueCi('83')
    const res = await api('POST', '/api/estudiantes', {
      estudiante: {
        ...contactoObligatorio,
        tipo_ci: 'V',
        numero_ci: uniqueCi('79'),
        primer_nombre: 'Rep',
        primer_apellido: 'Sin Parentesco',
        fecha_nacimiento: '2012-04-10',
        sexo: 'F',
      },
      inscripcion: {
        anio_escolar: '2025-2026',
        anio: '1er Año',
        seccion: 'A',
        fecha_inscripcion: '2025-09-15',
      },
      representantes: [{ ...repObligatorio, tipo_ci: 'V', numero_ci: repCi, nombre: 'Ana Pérez' }],
      documentos: { ...allDocumentos },
    })
    assert.equal(res.status, 201)
    const body = await res.json()
    extraStudentIds.push(body.estudiante.id)
    createdRepCis.push(repCi)
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
        pais_nacimiento: 'Venezuela',
        estado_nacimiento: 'Miranda',
        municipio_nacimiento: 'Sucre',
        lateralidad: 'Derecha',
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
        { ...repObligatorio, tipo_ci: 'V', numero_ci: repCiPrimary, nombre: 'Ana Pérez', parentesco: 'Madre' },
      ],
      documentos: { ...allDocumentos },
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
    assert.equal(body.inscripciones[0].documentos.carpeta, 1)

    assert.equal(body.representantes.length, 1)
    assert.equal(body.representantes[0].numero_ci, repCiPrimary)
    assert.equal(body.representantes[0].parentesco, 'Madre')
  })

  await t.test('rejects an enrollment that is missing consigned documents', async () => {
    const res = await api('POST', '/api/estudiantes', {
      estudiante: {
        ...contactoObligatorio,
        tipo_ci: 'V',
        numero_ci: uniqueCi('55'),
        primer_nombre: 'Sin',
        primer_apellido: 'Documentos',
        fecha_nacimiento: '2012-07-01',
        sexo: 'M',
      },
      inscripcion: {
        anio_escolar: '2025-2026',
        anio: '1er Año',
        seccion: 'A',
        fecha_inscripcion: '2025-09-17',
      },
      representantes: [
        { ...repObligatorio, tipo_ci: 'V', numero_ci: uniqueCi('56'), nombre: 'Rep Documentos', parentesco: 'Madre' },
      ],
      documentos: { ...allDocumentos, boleta: false },
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'bad_request')
    // The rejection names the document that is missing.
    assert.match(body.details.documentos, /boleta/)
  })

  await t.test('rejects a duplicate cédula with 409', async () => {
    const res = await api('POST', '/api/estudiantes', {
      estudiante: {
        ...contactoObligatorio,
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
      representantes: [{ ...repObligatorio, tipo_ci: 'V', numero_ci: repCiPrimary, nombre: 'Ana Pérez', parentesco: 'Madre' }],
      documentos: { ...allDocumentos },
    })
    assert.equal(res.status, 409)
    const body = await res.json()
    assert.equal(body.code, 'conflict')
  })

  await t.test('rejects an invalid section for the year with 400', async () => {
    const res = await api('POST', '/api/estudiantes', {
      estudiante: {
        ...contactoObligatorio,
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
      representantes: [{ ...repObligatorio, tipo_ci: 'V', numero_ci: repCiPrimary, nombre: 'Ana Pérez', parentesco: 'Madre' }],
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
        ...contactoObligatorio,
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
        { ...repObligatorio, tipo_ci: 'V', numero_ci: sectionRepCi, nombre: 'Rep Sección', parentesco: 'Madre' },
      ],
      documentos: { ...allDocumentos },
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

  await t.test('keeps the inscription status exclusive (regular or repeater)', async () => {
    const repeaterCi = uniqueCi('44')
    const repCi = uniqueCi('45')

    const res = await api('POST', '/api/estudiantes', {
      estudiante: {
        ...contactoObligatorio,
        tipo_ci: 'V',
        numero_ci: repeaterCi,
        primer_nombre: 'Luis',
        primer_apellido: 'Gómez',
        fecha_nacimiento: '2011-06-02',
        sexo: 'M',
      },
      inscripcion: {
        anio: '1er Año',
        seccion: 'A',
        anio_escolar: '2025-2026',
        fecha_inscripcion: '2025-09-16',
        repite: true,
      },
      representantes: [{ ...repObligatorio, tipo_ci: 'V', numero_ci: repCi, nombre: 'Eva Gómez', parentesco: 'Madre' }],
      documentos: { ...allDocumentos },
    })
    assert.equal(res.status, 201)
    const body = await res.json()
    extraStudentIds.push(body.estudiante.id)
    createdRepCis.push(repCi)

    // A repeater is never a regular registration: `repite` alone clears `regular`.
    assert.equal(body.inscripciones[0].regular, 0)
    assert.equal(body.inscripciones[0].repite, 1)

    // Going back to regular must clear `repite`.
    const updated = await api('PUT', `/api/estudiantes/${body.estudiante.id}`, {
      inscripcion: { anio_escolar: '2025-2026', regular: true },
    })
    assert.equal(updated.status, 200)
    const updatedBody = await updated.json()
    assert.equal(updatedBody.inscripciones[0].regular, 1)
    assert.equal(updatedBody.inscripciones[0].repite, 0)
  })

  await t.test('reconciles representatives on update', async () => {
    const repCiSecondary = uniqueCi('33')
    createdRepCis.push(repCiSecondary)

    // Replace the primary representative with a secondary one.
    const res = await api('PUT', `/api/estudiantes/${createdId}`, {
      representantes: [
        { ...repObligatorio, tipo_ci: 'V', numero_ci: repCiSecondary, nombre: 'Pedro Pérez', parentesco: 'Padre' },
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

  // --- S3: leaving no representative behind ----------------------------------
  // The bridge rows disappear with the student (FK CASCADE), so a representative
  // linked only to the deleted student used to stay forever as unreachable
  // garbage. The case that matters is the MIXED one — a student carrying an
  // exclusive representative AND one shared with a sibling — because a cleanup
  // that swept "everything that was linked here" would pass the separate cases
  // and still corrupt the sibling's record.

  const crearConRepresentantes = (estudianteCi, representantes) =>
    api('POST', '/api/estudiantes', {
      estudiante: {
        ...contactoObligatorio,
        tipo_ci: 'V',
        numero_ci: estudianteCi,
        primer_nombre: 'Higiene',
        primer_apellido: 'De Datos',
        fecha_nacimiento: '2012-04-10',
        sexo: 'M',
      },
      inscripcion: {
        anio_escolar: '2025-2026',
        anio: '1er Año',
        seccion: 'A',
        fecha_inscripcion: '2025-09-15',
      },
      representantes: representantes.map(({ ci, nombre, parentesco }) => ({
        ...repObligatorio,
        tipo_ci: 'V',
        numero_ci: ci,
        nombre,
        parentesco,
      })),
      documentos: { ...allDocumentos },
    })

  const representantesPorCi = (ci) => db.tabla('representantes').select(null, null, { numero_ci: ci })
  const enlacesDe = (estudianteId) =>
    db.tabla('estudiante_representante').select(null, null, { estudiante_id: estudianteId })

  // A carries an exclusive representative plus one shared with B.
  const exclusiveCi = uniqueCi('41')
  const sharedCi = uniqueCi('42')
  createdRepCis.push(exclusiveCi, sharedCi)

  const createdA = await crearConRepresentantes(uniqueCi('43'), [
    { ci: exclusiveCi, nombre: 'Representante Exclusivo', parentesco: 'Madre' },
    { ci: sharedCi, nombre: 'Representante Compartido', parentesco: 'Padre' },
  ])
  assert.equal(createdA.status, 201, 'the mixed case could not be created')
  const mixedId = (await createdA.json()).estudiante.id
  // A red run leaves rows behind, so register them for cleanup before any
  // assertion can fail.
  extraStudentIds.push(mixedId)

  const createdB = await crearConRepresentantes(uniqueCi('44'), [
    { ci: sharedCi, nombre: 'Representante Compartido', parentesco: 'Padre' },
  ])
  assert.equal(createdB.status, 201, 'the sibling could not be created')
  const siblingId = (await createdB.json()).estudiante.id
  extraStudentIds.push(siblingId)

  const sharedRow = (await representantesPorCi(sharedCi))[0]

  await t.test('a rejected delete of an unknown student changes nothing', async () => {
    const snapshot = async () => ({
      mezclado: (await db.tabla('estudiantes').select(null, null, { id: mixedId })).length,
      exclusivo: (await representantesPorCi(exclusiveCi)).length,
      compartido: (await representantesPorCi(sharedCi)).length,
      enlacesMezclado: (await enlacesDe(mixedId)).length,
      enlacesHermano: (await enlacesDe(siblingId)).length,
    })
    // Scoped to this file's own rows on purpose: other e2e files run in parallel
    // against the same database, so a table-wide count would flake.
    const before = await snapshot()

    const res = await api('DELETE', '/api/estudiantes/999999999')
    assert.equal(res.status, 404, 'an unknown student must stay a 404')
    assert.equal((await res.json()).code, 'not_found')
    assert.deepEqual(await snapshot(), before, 'a rejected delete must not alter stored data')
  })

  await t.test('the exclusive representative goes and the shared one stays linked', async () => {
    const del = await api('DELETE', `/api/estudiantes/${mixedId}`)
    assert.equal(del.status, 200)
    assert.deepEqual(await del.json(), { ok: true })

    assert.equal(
      (await representantesPorCi(exclusiveCi)).length,
      0,
      'the representative left with no student must be gone',
    )

    const survivor = (await representantesPorCi(sharedCi))[0]
    assert.ok(survivor, 'the representative a sibling still uses must survive')
    assert.equal(survivor.id, sharedRow.id, 'the survivor must be the very same row, not a re-created one')

    const sibling = await api('GET', `/api/estudiantes/${siblingId}`)
    assert.equal(sibling.status, 200)
    assert.equal((await sibling.json()).representantes[0].numero_ci, sharedCi)
  })

  await t.test('a student with no linked representative still deletes cleanly', async () => {
    // Reaching the delete with zero links takes an earlier unlink: the sweep is
    // scoped to the delete, so a representative unlinked before it is not its
    // business (a separate decision, see odd/tasks/higiene-datos.md).
    const unlinkedCi = uniqueCi('45')
    const created = await crearConRepresentantes(uniqueCi('46'), [
      { ci: unlinkedCi, nombre: 'Representante Desvinculado', parentesco: 'Madre' },
    ])
    assert.equal(created.status, 201)
    const unlinkedStudentId = (await created.json()).estudiante.id
    extraStudentIds.push(unlinkedStudentId)

    const unlink = await api('PUT', `/api/estudiantes/${unlinkedStudentId}`, { representantes: [] })
    assert.equal(unlink.status, 200)
    assert.equal((await unlink.json()).representantes.length, 0)

    const del = await api('DELETE', `/api/estudiantes/${unlinkedStudentId}`)
    assert.equal(del.status, 200)
    assert.deepEqual(await del.json(), { ok: true })
    assert.equal((await db.tabla('estudiantes').select(null, null, { id: unlinkedStudentId })).length, 0)
    assert.equal(
      (await representantesPorCi(unlinkedCi)).length,
      1,
      'the sweep must not touch a representative that was not linked at delete time',
    )
  })
})
