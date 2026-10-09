'use strict'

const password = require('../../utils/password')

// A precomputed salt/hash pair used when the requested user does not exist, so
// the KDF always runs. Costs a few tens of ms once, at module load.
const DUMMY = password.derive('')
const DUMMY_SALT = DUMMY.salt
const DUMMY_HASH = DUMMY.hash

/**
 * Constant-cost credential check. Runs the password KDF for every request —
 * including unknown users — so login latency does not reveal whether a username
 * exists.
 * @param {object|null} row - the stored user row (or null when not found)
 * @param {string} clientHash - hex SHA-256 digest supplied by the client
 * @returns {boolean}
 */
function checkCredentials(row, clientHash) {
  const salt = row ? row.salt : DUMMY_SALT
  const hash = row ? row.password_hash : DUMMY_HASH

  // Evaluate before the row check so the KDF is never short-circuited away.
  const verified = password.verify(clientHash, salt, hash)
  return Boolean(row) && verified
}

module.exports = { checkCredentials }
