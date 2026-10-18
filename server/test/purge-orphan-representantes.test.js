'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

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

const uniqueCi = () => String(Date.now()).slice(-9) + String(Math.floor(Math.random() * 90) + 10)

const SCRIPT = path.resolve(__dirname, '..', 'db', 'purge-orphan-representantes.js')
const SERVER_DIR = path.resolve(__dirname, '..')

test('purge-orphan-representantes (require MariaDB and a configured .env)', async (t) => {
  if (!hasEnv) {
    return t.skip('Skipping purge tests: missing required env vars (.env at repo root)')
  }

  const db = require('../src/config/db')
  try {
    await db.query('SELECT 1')
  } catch (error) {
    return t.skip(`Skipping purge tests: database unreachable (${error.message})`)
  }

  const purge = require('../db/purge-orphan-representantes')

  const createdRepCis = []
  const createdStudentIds = []

  t.after(async () => {
    for (const id of createdStudentIds) {
      try {
        await db.tabla('estudiantes').delete({ id })
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
    db.end()
  })

  const insertRepresentante = async (nombre) => {
    const numeroCi = uniqueCi()
    createdRepCis.push(numeroCi)
    const { insertId } = await db.tabla('representantes').insert({ tipo_ci: 'V', numero_ci: numeroCi, nombre })
    return { id: insertId, numero_ci: numeroCi }
  }

  const insertEstudiante = async () => {
    const numeroCi = uniqueCi()
    const { insertId } = await db.tabla('estudiantes').insert({
      tipo_ci: 'V',
      numero_ci: numeroCi,
      primer_nombre: 'Carrera',
      primer_apellido: 'De Purga',
      fecha_nacimiento: '2012-04-10',
      sexo: 'M',
    })
    createdStudentIds.push(insertId)
    return insertId
  }

  await t.test('a mistyped flag fails instead of passing for a dry run', async () => {
    const result = spawnSync(process.execPath, ['--env-file-if-exists=../.env', SCRIPT, '--aply'], {
      cwd: SERVER_DIR,
      encoding: 'utf8',
    })

    assert.notEqual(result.status, 0, 'a typo must not exit as a successful dry run')
    assert.match(result.stderr, /Unknown option/)
  })

  await t.test('the sweep is one guarded statement, and a row that survives is not reported as deleted', async () => {
    const orphan = await insertRepresentante('Purga En Carrera')
    const estudianteId = await insertEstudiante()

    const statements = []
    const original = db.query.bind(db)
    // Link the representative in the window between the report query and the
    // delete. The condition travels inside the DELETE, so the row must survive;
    // the report must then say so instead of claiming it deleted the row.
    db.query = async (sql, ...rest) => {
      const text = typeof sql === 'string' ? sql : sql?.sql
      statements.push(text)
      if (text && /DELETE FROM `?representantes`?/.test(text)) {
        await db
          .tabla('estudiante_representante')
          .insert({ estudiante_id: estudianteId, representante_id: orphan.id, parentesco: 'Madre' })
      }
      return original(sql, ...rest)
    }

    let applied
    try {
      applied = await purge.purgeOrphanRepresentantes({ apply: true, ids: [orphan.id] })
    } finally {
      db.query = original
    }

    const deletes = statements.filter((sql) => sql && /DELETE FROM/.test(sql))
    assert.equal(deletes.length, 1, `the sweep must be a single statement, saw ${JSON.stringify(deletes)}`)
    assert.match(deletes[0], /NOT EXISTS/)

    assert.equal(
      (await db.tabla('representantes').select(null, null, { id: orphan.id })).length,
      1,
      'the representative was claimed before the delete, so it must survive',
    )
    assert.ok(
      applied.deleted.every((rep) => rep.id !== orphan.id),
      'a representative that survived must not be reported as deleted',
    )
  })
})
