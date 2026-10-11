'use strict'

// Deterministic env for the unit test process: config/env.js asserts every
// required variable on load, and this suite only cares about the JWT secret.
process.env.JWT_SECRET = 'test-secret-unit'
process.env.JWT_EXPIRES_IN = '1h'
process.env.DB_HOST = '127.0.0.1'
process.env.DB_PORT = '3306'
process.env.DB_USER = 'test'
process.env.DB_PASSWORD = 'test'
process.env.DB_NAME = 'test'

const test = require('node:test')
const assert = require('node:assert/strict')
const jsonwebtoken = require('jsonwebtoken')
const { sign, verify } = require('../src/utils/jwt')

test('sign/verify roundtrip returns the payload', () => {
  const token = sign({ sub: 7, usuario: 'admin', rol: 'admin' })
  const payload = verify(token)

  assert.equal(payload.sub, 7)
  assert.equal(payload.usuario, 'admin')
  assert.equal(payload.rol, 'admin')
})

test('a tampered token fails verification', () => {
  const token = sign({ sub: 1 })
  const [header, payload, signature] = token.split('.')

  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  decoded.sub = 999
  const forgedPayload = Buffer.from(JSON.stringify(decoded)).toString('base64url')
  const tampered = `${header}.${forgedPayload}.${signature}`

  assert.throws(() => verify(tampered))
})

test('a token signed with another secret fails verification', () => {
  const token = jsonwebtoken.sign({ sub: 1 }, 'another-secret', { expiresIn: '1h' })

  assert.throws(() => verify(token))
})
