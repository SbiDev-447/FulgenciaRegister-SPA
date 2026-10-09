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

test('auth endpoints (require MariaDB and a configured .env)', async (t) => {
  if (!hasEnv) {
    return t.skip('Skipping auth e2e: missing required env vars (.env at repo root)')
  }

  let db
  try {
    db = require('../src/config/db')
    await withTimeout(db.query('SELECT 1'), 5000)
  } catch (error) {
    return t.skip(`Skipping auth e2e: database unreachable (${error.message})`)
  }

  const { createApp } = require('../src/app')
  const server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    db.end()
  })

  const base = `http://127.0.0.1:${server.address().port}`
  const login = (password) =>
    fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'admin', password }),
    })

  let cookie

  await t.test('rejects a wrong password with 401 and a generic code', async () => {
    const res = await login(clientDigest('not-the-password'))
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.code, 'unauthorized')
  })

  await t.test('rejects a missing body with 400', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'bad_request')
  })

  await t.test('logs in the seeded admin and sets an auth cookie', async () => {
    const res = await login(clientDigest('admin123'))
    assert.equal(res.status, 200)

    const body = await res.json()
    assert.equal(body.usuario.usuario, 'admin')
    assert.equal(body.usuario.rol, 'admin')
    assert.equal(body.usuario.password_hash, undefined)
    assert.equal(body.usuario.salt, undefined)

    const setCookies = res.headers.getSetCookie()
    const tokenCookie = setCookies.find((value) => value.startsWith('fulgencia_token='))
    assert.ok(tokenCookie, 'expected a fulgencia_token Set-Cookie header')
    cookie = tokenCookie.split(';')[0]
  })

  await t.test('returns the current user for an authenticated request', async () => {
    const res = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } })
    assert.equal(res.status, 200)

    const body = await res.json()
    assert.equal(body.usuario.usuario, 'admin')
    assert.equal(body.usuario.rol, 'admin')
    assert.equal(body.usuario.password_hash, undefined)
  })

  await t.test('rejects /me without a cookie with 401', async () => {
    const res = await fetch(`${base}/api/auth/me`)
    assert.equal(res.status, 401)
  })

  await t.test('logs out and clears the cookie', async () => {
    const res = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    assert.equal(res.status, 200)

    const body = await res.json()
    assert.equal(body.ok, true)

    const setCookies = res.headers.getSetCookie()
    const cleared = setCookies.find((value) => value.startsWith('fulgencia_token='))
    assert.ok(cleared, 'expected the auth cookie to be cleared')
    assert.match(cleared, /Max-Age=0|Expires=Thu, 01 Jan 1970/i)
  })
})
