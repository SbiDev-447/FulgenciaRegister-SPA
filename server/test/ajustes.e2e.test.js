'use strict'

// Ajustes endpoints: the sitting director, the ministry logo, and the two
// maintenance operations. Same shape as the other e2e suites: the real app on a
// random port, the real database, and a skip when either is missing.
//
// The settings screen is the one place that can change what every document says,
// so these tests assert the persisted result, not just the status code.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')

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

// A real 1x1 PNG: the server checks the signature, not just the header, so a
// made-up buffer would be rejected for the wrong reason.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    timer.unref()
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

test('ajustes endpoints (require MariaDB and a configured .env)', async (t) => {
  if (!hasEnv) {
    return t.skip('Skipping ajustes e2e: missing required env vars (.env at repo root)')
  }

  let db
  try {
    db = require('../src/config/db')
    await withTimeout(db.query('SELECT 1'), 5000)
  } catch (error) {
    return t.skip(`Skipping ajustes e2e: database unreachable (${error.message})`)
  }

  // The settings are real data someone may have typed. Put back exactly what was
  // there, whatever happens below.
  const before = await db.tabla('ajustes').select({ campos: ['clave', 'valor', 'actualizado_en'] })
  await db.tabla('ajustes').delete('1 = 1')

  const server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))

  const base = `http://127.0.0.1:${server.address().port}`
  let cookie
  let orphanId = null
  let backupFile = null

  const api = (method, url, body, raw) =>
    fetch(`${base}${url}`, {
      method,
      headers: {
        ...(raw ? { 'Content-Type': raw.type } : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: raw ? raw.buffer : body === undefined ? undefined : JSON.stringify(body),
    })

  t.after(async () => {
    try {
      if (orphanId !== null) await db.tabla('representantes').delete({ id: orphanId })
    } catch {
      // Best-effort cleanup.
    }
    try {
      await db.tabla('ajustes').delete('1 = 1')
      for (const row of before) {
        await db.tabla('ajustes').insert({
          clave: row.clave,
          valor: row.valor,
          actualizado_en: row.actualizado_en,
        })
      }
    } catch {
      // Best-effort restore.
    }
    if (backupFile) {
      try {
        fs.rmSync(backupFile, { force: true })
      } catch {
        // Best-effort cleanup of the test's own dump.
      }
    }
    await new Promise((resolve) => server.close(resolve))
    db.end()
  })

  await t.test('rejects every settings endpoint without a cookie', async () => {
    assert.equal((await fetch(`${base}/api/ajustes`)).status, 401)
    assert.equal((await fetch(`${base}/api/ajustes/logo`)).status, 401)

    const put = await fetch(`${base}/api/ajustes/director`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Ana', ci: 'V-1', cargo: 'Directora' }),
    })
    assert.equal(put.status, 401)
  })

  await t.test('logs in the seeded admin', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'admin', password: clientDigest('admin123') }),
    })
    assert.equal(res.status, 200)
    const tokenCookie = res.headers.getSetCookie().find((value) => value.startsWith('fulgencia_token='))
    assert.ok(tokenCookie, 'expected a fulgencia_token Set-Cookie header')
    cookie = tokenCookie.split(';')[0]
  })

  await t.test('reports nothing configured instead of inventing a director', async () => {
    const res = await api('GET', '/api/ajustes')
    assert.equal(res.status, 200)
    const body = await res.json()

    assert.equal(body.director, null)
    assert.equal(body.logo, null)
    assert.deepEqual(body.positions, ['Director', 'Directora'])
    assert.equal(body.maxLogoBytes, 2 * 1024 * 1024)
  })

  await t.test('saves the director, canonicalizing the cédula', async () => {
    const put = await api('PUT', '/api/ajustes/director', {
      nombre: '  Ana   María Pérez ',
      ci: 'v-12.345.678',
      cargo: 'Directora',
    })
    assert.equal(put.status, 200)
    const saved = await put.json()
    assert.equal(saved.nombre, 'Ana María Pérez')
    assert.equal(saved.ci, 'V-12345678')
    assert.equal(saved.cargo, 'Directora')

    const read = await (await api('GET', '/api/ajustes')).json()
    assert.deepEqual(
      { nombre: read.director.nombre, ci: read.director.ci, cargo: read.director.cargo },
      { nombre: 'Ana María Pérez', ci: 'V-12345678', cargo: 'Directora' },
    )
  })

  await t.test('names every invalid director field in one rejection', async () => {
    const res = await api('PUT', '/api/ajustes/director', { nombre: 'X', ci: 'ZZ', cargo: 'Rector' })
    assert.equal(res.status, 400)
    const body = await res.json()

    assert.equal(body.code, 'bad_request')
    assert.deepEqual(Object.keys(body.details).sort(), ['cargo', 'ci', 'nombre'])
  })

  await t.test('stores an uploaded logo and serves back the same bytes', async () => {
    const put = await api('PUT', '/api/ajustes/logo', undefined, { type: 'image/png', buffer: PNG_1X1 })
    assert.equal(put.status, 200)
    const saved = await put.json()
    assert.equal(saved.mime, 'image/png')
    assert.equal(saved.bytes, PNG_1X1.length)
    assert.match(saved.url, /^\/api\/ajustes\/logo\?v=/)

    const image = await api('GET', '/api/ajustes/logo')
    assert.equal(image.status, 200)
    assert.equal(image.headers.get('content-type'), 'image/png')
    assert.equal(image.headers.get('cache-control'), 'no-cache')
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), PNG_1X1)

    const read = await (await api('GET', '/api/ajustes')).json()
    assert.equal(read.logo.mime, 'image/png')
    assert.equal(read.logo.bytes, PNG_1X1.length)
  })

  await t.test('refuses a file that is not the image it claims to be', async () => {
    const fake = await api('PUT', '/api/ajustes/logo', undefined, {
      type: 'image/png',
      buffer: Buffer.from('not a png at all'),
    })
    assert.equal(fake.status, 400)
    assert.equal((await fake.json()).details.logo, 'must be a real PNG, JPEG or WebP image')

    const wrongType = await api('PUT', '/api/ajustes/logo', undefined, {
      type: 'application/pdf',
      buffer: PNG_1X1,
    })
    assert.equal(wrongType.status, 400)
  })

  await t.test('previews the orphan representatives and deletes only those', async () => {
    const inserted = await db.tabla('representantes').insert({
      tipo_ci: 'V',
      numero_ci: String(Date.now()).slice(-9),
      nombre: 'Huerfano De Prueba',
    })
    orphanId = inserted.insertId

    const preview = await (await api('GET', '/api/ajustes/representantes-huerfanos')).json()
    assert.ok(
      preview.representantes.some((rep) => rep.id === orphanId),
      'the representative just created is not reported as an orphan',
    )

    const purge = await api('POST', '/api/ajustes/purgar-representantes')
    assert.equal(purge.status, 200)
    const result = await purge.json()
    assert.ok(result.eliminados.some((rep) => rep.id === orphanId))
    assert.equal(result.restantes, 0)

    const gone = await db.tabla('representantes').selectById(orphanId)
    assert.equal(gone ?? null, null)
  })

  await t.test('writes a real dump and reports what it holds', async (t) => {
    const res = await api('POST', '/api/ajustes/backup')

    if (res.status === 503) {
      // Docker absent or the container stopped: the contract is the typed error,
      // not a silently missing file.
      const body = await res.json()
      assert.equal(body.code, 'backup_failed')
      return t.skip('Skipping the backup assertion: the database container is not reachable from Node')
    }

    assert.equal(res.status, 200)
    const body = await res.json()
    assert.match(body.archivo, /^backups\/.+\.sql$/)
    assert.ok(body.tablas.includes('ajustes'), 'the dump does not carry the new settings table')
    assert.ok(body.bytes > 0)

    backupFile = path.resolve(__dirname, '..', '..', body.archivo)
    assert.ok(fs.existsSync(backupFile))
    assert.match(fs.readFileSync(backupFile, 'utf8'), /CREATE TABLE/i)
  })
})
