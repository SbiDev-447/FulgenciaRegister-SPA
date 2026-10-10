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

// Fixed fixtures, cleaned before and after so the suite is idempotent.
const STUDENT_CIS = new Set(['00012', '13', '14'])
const REP_CIS = new Set(['99999999', '00099', '99'])

const studentPayload = (numeroCi, nombre, repCi) => ({
  estudiante: {
    tipo_ci: 'V',
    numero_ci: numeroCi,
    primer_nombre: nombre,
    primer_apellido: 'Cero',
    fecha_nacimiento: '2010-01-01',
    sexo: 'M',
  },
  inscripcion: {
    anio_escolar: '2026-2027',
    anio: '1er Año',
    seccion: 'A',
    fecha_inscripcion: '2026-09-01',
  },
  representantes: [{ tipo_ci: 'V', numero_ci: repCi, nombre: 'Rep Cero' }],
})

// A cédula is an identifier, not a number: lookups must compare `numero_ci` as
// a string so a leading-zero cédula never resolves to a different student.
test('cédula lookups compare numero_ci as a string (leading-zero safety)', async (t) => {
  if (!hasEnv) {
    return t.skip('Skipping cédula e2e: missing required env vars (.env at repo root)')
  }

  let db
  try {
    db = require('../src/config/db')
    await withTimeout(db.query('SELECT 1'), 5000)
  } catch (error) {
    return t.skip(`Skipping cédula e2e: database unreachable (${error.message})`)
  }

  const server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`

  const cleanFixtures = async () => {
    const students = await db.tabla('estudiantes').select(null, null, { tipo_ci: 'V' })
    for (const student of students) {
      if (STUDENT_CIS.has(student.numero_ci)) {
        await db.tabla('estudiantes').delete({ id: student.id })
      }
    }
    const reps = await db.tabla('representantes').select(null, null, { tipo_ci: 'V' })
    for (const rep of reps) {
      if (REP_CIS.has(rep.numero_ci)) {
        await db.tabla('representantes').delete({ id: rep.id })
      }
    }
  }

  t.after(async () => {
    await cleanFixtures().catch(() => {})
    await new Promise((resolve) => server.close(resolve))
    db.end()
  })

  await cleanFixtures()

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin', password: clientDigest('admin123') }),
  })
  assert.equal(login.status, 200, 'login should succeed')
  const cookie = login.headers.getSetCookie()[0].split(';')[0]

  const create = (payload) =>
    fetch(`${base}/api/estudiantes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(payload),
    })

  // Scenario A — only a leading-zero student exists. Looking up the numeric
  // equivalent must NOT return it (there is no student with cédula V-12).
  const created = await create(studentPayload('00012', 'Cero', '99999999'))
  assert.equal(created.status, 201, 'fixture student should be created')

  const wrong = await fetch(`${base}/api/documentos/verificar/V-12`, {
    headers: { Cookie: cookie },
  })
  assert.equal(wrong.status, 404, 'V-12 must not resolve to the V-00012 student')

  const exact = await fetch(`${base}/api/documentos/verificar/V-00012`, {
    headers: { Cookie: cookie },
  })
  assert.equal(exact.status, 200, 'V-00012 must resolve to its own student')
  assert.equal((await exact.json()).estudiante.numero_ci, '00012')

  // Scenario B — representative reuse must key on the exact cédula string.
  // V-00099 and V-99 are different cédulas and must stay separate rows.
  const s13 = await create(studentPayload('13', 'Trece', '00099'))
  assert.equal(s13.status, 201)
  const s14 = await create(studentPayload('14', 'Catorce', '99'))
  assert.equal(s14.status, 201)

  const reps = await db.tabla('representantes').select(null, null, { tipo_ci: 'V' })
  const distinct = reps.filter((rep) => rep.numero_ci === '00099' || rep.numero_ci === '99')
  assert.equal(distinct.length, 2, 'V-00099 and V-99 must be two distinct representatives')
})
