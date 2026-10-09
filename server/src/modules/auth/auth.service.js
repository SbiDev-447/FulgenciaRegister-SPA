'use strict'

const db = require('../../config/db')
const jwt = require('../../utils/jwt')
const { checkCredentials } = require('./credentials')
const { HttpError } = require('../../utils/httpError')

/**
 * Strip sensitive columns before a user leaves the server. Never expose
 * password_hash or salt.
 * @param {object} row
 * @returns {{ id: number, usuario: string, nombre: string, rol: string }}
 */
function toPublicUser(row) {
  return {
    id: row.id,
    usuario: row.usuario,
    nombre: row.nombre,
    rol: row.rol,
  }
}

/**
 * Authenticate a user by their SHA-256 password digest.
 * @param {string} usuario
 * @param {string} clientHash - hex SHA-256 digest of the raw password
 * @returns {Promise<{ token: string, usuario: object }>}
 */
async function login(usuario, clientHash) {
  const row = await db.tabla('usuarios').selectOne(null, null, { usuario })

  // Generic error for both unknown user and bad password. checkCredentials runs
  // the KDF even for unknown users, so timing does not leak user existence.
  if (!checkCredentials(row, clientHash)) {
    throw HttpError.unauthorized('Invalid credentials')
  }

  const user = toPublicUser(row)
  const token = jwt.sign({ sub: user.id, usuario: user.usuario, rol: user.rol })

  return { token, usuario: user }
}

/**
 * Load a public user by primary key.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function getById(id) {
  const row = await db.tabla('usuarios').selectOne(null, null, { id })
  return row ? toPublicUser(row) : null
}

module.exports = { login, getById, toPublicUser }
