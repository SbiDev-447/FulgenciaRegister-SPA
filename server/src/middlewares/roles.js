'use strict'

// Role gates. Kept apart from `auth.js` on purpose: `requireAuth` reads the user
// from the database, while deciding whether that user may do something needs
// nothing but `req.user`. A module with no connection can be tested without a
// database or an `.env`.

const { HttpError } = require('../utils/httpError')

/**
 * Require the authenticated user to hold the admin role. Runs after
 * `requireAuth`, which is what puts `req.user` in place.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return next(HttpError.unauthorized())
  }
  if (req.user.rol !== 'admin') {
    return next(HttpError.forbidden('Administrator role required'))
  }
  return next()
}

module.exports = { requireAdmin }
