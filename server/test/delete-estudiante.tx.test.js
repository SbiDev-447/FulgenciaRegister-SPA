'use strict'

// S3.3 of odd/tasks/higiene-datos.md: the student delete and the orphan cleanup
// share ONE transaction. The happy path commits invisibly, so the only way to
// observe that contract is to inject a failure inside the cleanup and check that
// the student comes back: without the transaction the student would already be
// gone when the cleanup dies.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')

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

const uniqueCi = (offset = '') => String(Date.now()).slice(-9) + offset

test('a failure in the orphan cleanup rolls the whole delete back (S3.3)', async (t) => {
  if (!hasEnv) {
    return t.skip('Skipping delete-transaction test: missing required env vars (.env at repo root)')
  }

  let db
  try {
    db = require('../src/config/db')
    await db.query('SELECT 1')
  } catch (error) {
    return t.skip(`Skipping delete-transaction test: database unreachable (${error.message})`)
  }

  const service = require('../src/modules/estudiantes/estudiantes.service')

  const estudianteCi = uniqueCi('71')
  const repCi = uniqueCi('72')
  const record = await service.createEstudiante({
    estudiante: {
      tipo_ci: 'V',
      numero_ci: estudianteCi,
      primer_nombre: 'Transaccion',
      primer_apellido: 'Atomica',
      fecha_nacimiento: '2012-04-10',
      sexo: 'M',
    },
    inscripcion: {
      anio_escolar: '2025-2026',
      anio: '1er Año',
      seccion: 'A',
      fecha_inscripcion: '2025-09-15',
    },
    representantes: [
      { tipo_ci: 'V', numero_ci: repCi, nombre: 'Rep Transaccion', parentesco: 'Madre' },
    ],
    documentos: {
      partida_nacimiento: true,
      copia_cedula: true,
      boleta: true,
      fotos: true,
      carpeta: true,
      certificado_6to_grado: true,
    },
  })
  const estudianteId = record.estudiante.id
  const repId = (await db.tabla('representantes').select(null, null, { numero_ci: repCi }))[0].id

  // Patch ONLY the representatives table: every other query keeps using the real
  // wrapper, so the failure lands inside the transaction the service opened.
  const realTabla = db.tabla.bind(db)
  db.tabla = (name) => {
    const table = realTabla(name)
    if (name !== 'representantes') {
      return table
    }
    return new Proxy(table, {
      get(target, prop, receiver) {
        if (prop === 'delete') {
          return async () => {
            throw new Error('INJECTED_CLEANUP_FAILURE')
          }
        }
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }

  let surfaced = ''
  try {
    await service.deleteEstudiante(estudianteId)
  } catch (error) {
    surfaced = error.message
  } finally {
    db.tabla = realTabla
  }

  try {
    assert.match(surfaced, /INJECTED_CLEANUP_FAILURE/, 'the injected failure must surface')
    assert.equal(
      (await db.tabla('estudiantes').select(null, null, { id: estudianteId })).length,
      1,
      'the student must come back with the rollback',
    )
    assert.equal(
      (await db.tabla('estudiante_representante').select(null, null, { estudiante_id: estudianteId })).length,
      1,
      'the link must come back with the rollback',
    )
    assert.equal(
      (await db.tabla('representantes').select(null, null, { id: repId })).length,
      1,
      'the representative must be untouched by the failed attempt',
    )
  } finally {
    await db.tabla('estudiante_representante').delete({ estudiante_id: estudianteId }).catch(() => {})
    await db.tabla('estudiantes').delete({ id: estudianteId }).catch(() => {})
    await db.tabla('representantes').delete({ id: repId }).catch(() => {})
    db.end()
  }
})
