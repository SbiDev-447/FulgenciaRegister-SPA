'use strict'

const authService = require('./auth.service')
const { HttpError } = require('../../utils/httpError')
const { COOKIE_NAME, cookieOptions } = require('../../constants/auth')

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

async function login(req, res, next) {
  try {
    const { usuario, password } = req.body ?? {}

    if (!isNonEmptyString(usuario) || !isNonEmptyString(password)) {
      throw HttpError.badRequest('usuario and password are required')
    }

    const { token, usuario: user } = await authService.login(usuario, password)
    res.cookie(COOKIE_NAME, token, cookieOptions())
    res.json({ usuario: user })
  } catch (error) {
    next(error)
  }
}

function me(req, res) {
  res.json({ usuario: req.user })
}

function logout(req, res) {
  // maxAge must be dropped so the cookie is expired, not merely overwritten.
  res.clearCookie(COOKIE_NAME, cookieOptions({ maxAge: undefined }))
  res.json({ ok: true })
}

module.exports = { login, me, logout }
