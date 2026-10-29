'use strict'

const db = require('../config/db')
const jwt = require('../utils/jwt')
const { HttpError } = require('../utils/httpError')
const { toPublicUser } = require('../modules/auth/auth.service')
const { COOKIE_NAME } = require('../constants/auth')

/**
 * Require a valid auth cookie. On success populates `req.user` with the fresh
 * public user record. Any auth failure is a 401; infrastructure errors bubble up.
 */
async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME]

  if (!token) {
    return next(HttpError.unauthorized())
  }

  let payload
  try {
    payload = jwt.verify(token)
  } catch {
    return next(HttpError.unauthorized())
  }

  if (payload?.sub === undefined || payload?.sub === null) {
    return next(HttpError.unauthorized())
  }

  try {
    const row = await db.tabla('usuarios').selectById(payload.sub)
    if (!row) {
      return next(HttpError.unauthorized())
    }

    req.user = toPublicUser(row)
    return next()
  } catch (error) {
    return next(error)
  }
}

module.exports = { requireAuth }
