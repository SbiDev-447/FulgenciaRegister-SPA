'use strict'

const crypto = require('node:crypto')

// The client hashes the raw password with SHA-256 and sends only that digest.
// The server never sees the raw password, so scrypt is applied on top of the
// received digest. This mirrors db/seed.js exactly.
const DERIVED_KEY_LENGTH = 64
const SALT_BYTES = 16

/**
 * Derive a salted scrypt hash from the client-supplied SHA-256 digest.
 * @param {string} clientHash - hex SHA-256 digest of the raw password
 * @returns {{ salt: string, hash: string }}
 */
function derive(clientHash) {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex')
  const hash = crypto.scryptSync(clientHash, salt, DERIVED_KEY_LENGTH).toString('hex')
  return { salt, hash }
}

/**
 * Verify a client digest against a stored salt/hash pair. Never throws: a
 * malformed or mismatched stored hash simply returns false.
 * @param {string} clientHash - hex SHA-256 digest of the raw password
 * @param {string} salt - stored salt
 * @param {string} storedHash - stored scrypt hash (hex)
 * @returns {boolean}
 */
function verify(clientHash, salt, storedHash) {
  if (typeof clientHash !== 'string' || typeof salt !== 'string' || typeof storedHash !== 'string') {
    return false
  }

  try {
    const expected = crypto.scryptSync(clientHash, salt, DERIVED_KEY_LENGTH)
    const stored = Buffer.from(storedHash, 'hex')

    if (stored.length !== expected.length) {
      return false
    }

    return crypto.timingSafeEqual(expected, stored)
  } catch {
    return false
  }
}

module.exports = { derive, verify }
