'use strict'

const { HttpError } = require('../utils/httpError')

function notFound(req, res) {
  res.status(404).json({
    code: 'not_found',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  })
}

// Express identifies error handlers by arity: `next` must stay in the signature.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      code: err.code,
      message: err.message,
      details: err.details,
    })
  }

  const status = Number.isInteger(err.status) && err.status >= 400 ? err.status : 500
  if (status >= 500) {
    console.error(err)
  }
  return res.status(status).json({ code: 'internal_error', message: 'Unexpected server error' })
}

module.exports = { notFound, errorHandler }
