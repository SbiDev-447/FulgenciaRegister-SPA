'use strict'

const { HttpError } = require('../utils/httpError')
const { columnRejection } = require('../utils/mysqlErrors')

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

  // A value the column cannot hold is the client's mistake, not ours: answer
  // the 400 the form knows how to render, naming the field, instead of the 500
  // that tells the user nothing.
  const rejection = columnRejection(err)
  if (rejection) {
    return res.status(400).json({
      code: 'bad_request',
      message: 'A value does not fit its column',
      details: { [rejection.field]: rejection.reason },
    })
  }

  const status = Number.isInteger(err.status) && err.status >= 400 ? err.status : 500
  if (status >= 500) {
    console.error(err)
  }
  return res.status(status).json({ code: 'internal_error', message: 'Unexpected server error' })
}

module.exports = { notFound, errorHandler }
