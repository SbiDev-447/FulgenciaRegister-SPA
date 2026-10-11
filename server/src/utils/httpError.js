'use strict'

/**
 * Uniform HTTP error. The client localizes `code`; `message` is an English
 * fallback for logs and tooling.
 */
class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }

  static badRequest(message = 'Invalid request', details) {
    return new HttpError(400, 'bad_request', message, details)
  }

  static unauthorized(message = 'Not authenticated') {
    return new HttpError(401, 'unauthorized', message)
  }

  static forbidden(message = 'Not allowed') {
    return new HttpError(403, 'forbidden', message)
  }

  static notFound(message = 'Resource not found') {
    return new HttpError(404, 'not_found', message)
  }

  static conflict(message = 'Conflict', details) {
    return new HttpError(409, 'conflict', message, details)
  }
}

module.exports = { HttpError }
