'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { derive, verify } = require('../src/utils/password')

// The client sends sha256(rawPassword); the server derives scrypt on top of that
// digest. These tests mirror the seed contract exactly.
const clientDigest = (password) => crypto.createHash('sha256').update(password).digest('hex')

test('derive/verify roundtrip returns true', () => {
  const clientHash = clientDigest('admin123')
  const { salt, hash } = derive(clientHash)

  assert.equal(typeof salt, 'string')
  assert.equal(typeof hash, 'string')
  assert.equal(verify(clientHash, salt, hash), true)
})

test('verify returns false for a wrong digest', () => {
  const { salt, hash } = derive(clientDigest('admin123'))

  assert.equal(verify(clientDigest('wrong-password'), salt, hash), false)
})

test('verify returns false for a tampered stored hash', () => {
  const clientHash = clientDigest('admin123')
  const { salt, hash } = derive(clientHash)

  const firstChar = hash[0] === '0' ? '1' : '0'
  const tampered = firstChar + hash.slice(1)

  assert.notEqual(tampered, hash)
  assert.equal(verify(clientHash, salt, tampered), false)
})

test('two derives of the same input yield different salt and hash', () => {
  const clientHash = clientDigest('admin123')
  const first = derive(clientHash)
  const second = derive(clientHash)

  assert.notEqual(first.salt, second.salt)
  assert.notEqual(first.hash, second.hash)
})

test('verify returns false (never throws) on a malformed stored hash', () => {
  const clientHash = clientDigest('admin123')

  assert.equal(verify(clientHash, 'aabb', 'not-a-hex-hash'), false)
  assert.equal(verify(clientHash, 'aabb', ''), false)
  assert.equal(verify(clientHash, 'aabb', undefined), false)
})
