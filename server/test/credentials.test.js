'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

const { checkCredentials } = require('../src/modules/auth/credentials')
const password = require('../src/utils/password')

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex')

// An unknown user must still pay the KDF cost. Otherwise login latency reveals
// whether a username exists (timing-based enumeration).
test('an unknown user still runs the KDF and returns false', () => {
  const start = process.hrtime.bigint()
  const ok = checkCredentials(null, digest('whatever'))
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6

  assert.equal(ok, false)
  assert.ok(elapsedMs >= 5, `expected the KDF to run, took ${elapsedMs.toFixed(1)}ms`)
})

test('a known user is accepted with the right digest and rejected otherwise', () => {
  const { salt, hash } = password.derive(digest('s3cret'))

  assert.equal(checkCredentials({ salt, password_hash: hash }, digest('s3cret')), true)
  assert.equal(checkCredentials({ salt, password_hash: hash }, digest('nope')), false)
})

test('a known row with a malformed hash is rejected without throwing', () => {
  assert.equal(checkCredentials({ salt: 'abc', password_hash: 'zz' }, digest('s3cret')), false)
})
