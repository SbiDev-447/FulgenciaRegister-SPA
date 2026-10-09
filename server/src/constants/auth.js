'use strict'

const { nodeEnv } = require('../config/env')

const COOKIE_NAME = 'fulgencia_token'

// Must match the default JWT_EXPIRES_IN (8h) so the cookie and the token expire
// together.
const DEFAULT_EXPIRES_MS = 8 * 60 * 60 * 1000

/**
 * Cookie options for the auth token. Pass `{ maxAge: undefined }` to build the
 * options used when clearing the cookie.
 * @param {object} [overrides]
 * @returns {object}
 */
function cookieOptions(overrides = {}) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: nodeEnv === 'production',
    path: '/',
    maxAge: DEFAULT_EXPIRES_MS,
    ...overrides,
  }
}

module.exports = { COOKIE_NAME, DEFAULT_EXPIRES_MS, cookieOptions }
