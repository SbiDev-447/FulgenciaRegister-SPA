'use strict'

const crypto = require('node:crypto')
const db = require('../src/config/db')

// The client sends SHA-256(password). The server never sees the raw password,
// so it applies scrypt on top of the received digest.
function clientDigest(password) {
  return crypto.createHash('sha256').update(password).digest('hex')
}

function derivedHash(clientHash) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(clientHash, salt, 64).toString('hex')
  return { salt, hash }
}

const DEFAULT_USER = { usuario: 'admin', password: 'admin123', nombre: 'Administrador', rol: 'admin' }

async function seed() {
  await db.createAllTables()

  const usuarios = db.tabla('usuarios')
  const existing = await usuarios.selectOne(`usuario = '${DEFAULT_USER.usuario}'`)

  if (existing) {
    console.log(`Seed: user "${DEFAULT_USER.usuario}" already exists, skipping.`)
  } else {
    const { salt, hash } = derivedHash(clientDigest(DEFAULT_USER.password))
    await usuarios.insert({
      usuario: DEFAULT_USER.usuario,
      password_hash: hash,
      salt,
      nombre: DEFAULT_USER.nombre,
      rol: DEFAULT_USER.rol,
    })
    console.log(`Seed: created "${DEFAULT_USER.usuario}" (password: ${DEFAULT_USER.password}).`)
  }

  db.end()
}

seed().catch((error) => {
  console.error('Seed failed:', error)
  process.exit(1)
})
