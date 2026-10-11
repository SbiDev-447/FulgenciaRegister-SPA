'use strict'

const jsonwebtoken = require('jsonwebtoken')
const { jwtSecret, jwtExpiresIn } = require('../config/env')

/**
 * Sign a JWT payload with the configured secret and expiry.
 * @param {object} payload
 * @returns {string}
 */
function sign(payload) {
  return jsonwebtoken.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn })
}

/**
 * Verify a JWT and return its payload. Throws when the token is invalid or
 * expired; callers are expected to translate that into an auth failure.
 * @param {string} token
 * @returns {object}
 */
function verify(token) {
  return jsonwebtoken.verify(token, jwtSecret)
}

module.exports = { sign, verify }
