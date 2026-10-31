'use strict'

// Institutional settings and maintenance: the sitting director, the ministry
// logo printed on the letterhead, and the two housekeeping operations that used
// to need a terminal.
//
// Settings live in the database and not in the browser on purpose. The director
// and the logo belong to the school, not to the machine someone happened to use,
// and the backup offered on the same screen has to carry them.

const db = require('../../config/db')
const { HttpError } = require('../../utils/httpError')
const { parseCedula } = require('../../utils/cedula')

const DIRECTOR_KEY = 'director'
const LOGO_KEY = 'logo_ministerio'

/** The office is a choice, not free text: a letter signs as one or the other. */
const POSITIONS = ['Director', 'Directora']

const MAX_LOGO_BYTES = 2 * 1024 * 1024

// What a browser is allowed to send, and the signature that proves the bytes
// really are that format: the declared Content-Type is the client's word, and a
// file that is not an image would be served back to the app as one.
const LOGO_FORMATS = new Map([
  ['image/png', { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] }],
  ['image/jpeg', { ext: 'jpg', magic: [0xff, 0xd8, 0xff] }],
  ['image/webp', { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] }],
])

/** `2026-10-30 09:05:03`, the shape MariaDB reads for a DATETIME. */
function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(' ')
}

async function readValue(clave) {
  const row = await db.tabla('ajustes').selectOne({ where: { clave } })
  if (!row?.valor) {
    return null
  }
  try {
    return JSON.parse(row.valor)
  } catch {
    // A row someone edited by hand is treated as unset: the fallbacks in the
    // client are better than a crash on every settings read.
    return null
  }
}

async function writeValue(clave, value) {
  const valor = JSON.stringify(value)
  const existing = await db.tabla('ajustes').selectOne({ where: { clave } })
  const actualizado = stamp()

  if (existing) {
    await db.tabla('ajustes').update({ valor, actualizado_en: actualizado }, { clave })
  } else {
    await db.tabla('ajustes').insert({ clave, valor, actualizado_en: actualizado })
  }

  return { value, actualizadoEn: actualizado }
}

function normalizeSpaces(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

// Unicode-aware: a name with accents, ñ or any other script is still a name.
const HAS_LETTER = /\p{L}/u

/**
 * Names on a letterhead are set in capitals, and a form does not get to decide
 * that: the stored name is uppercase so the four documents print it that way
 * whether it was typed in lowercase or mixed case.
 * @param {unknown} value
 */
function upperName(value) {
  return normalizeSpaces(value).toUpperCase()
}

/**
 * Validate and canonicalize the director block. Canonical cédula (`V-12345678`)
 * and uppercase name, so the letter prints the same text no matter how it was
 * typed.
 * @param {{ nombre?: unknown, ci?: unknown, cargo?: unknown }} input
 * @returns {{ nombre: string, ci: string, cargo: string }}
 * @throws {HttpError} 400 naming each invalid field
 */
function parseDirector(input = {}) {
  const details = {}

  const nombre = upperName(input.nombre)
  if (nombre.length < 3) {
    details.nombre = 'must be at least 3 characters'
  } else if (nombre.length > 120) {
    details.nombre = 'must be at most 120 characters'
  } else if (!HAS_LETTER.test(nombre)) {
    details.nombre = 'must contain letters'
  }

  const cedula = parseCedula(input.ci)
  if (!cedula) {
    details.ci = 'must be a cédula such as V-12345678'
  }

  const cargo = normalizeSpaces(input.cargo)
  if (!POSITIONS.includes(cargo)) {
    details.cargo = `must be one of: ${POSITIONS.join(', ')}`
  }

  if (Object.keys(details).length > 0) {
    throw HttpError.badRequest('Invalid director settings', details)
  }

  return { nombre, ci: `${cedula.tipo_ci}-${cedula.numero_ci}`, cargo }
}

/**
 * Validate an uploaded logo against what it claims to be.
 * @param {{ mime?: unknown, buffer?: unknown }} upload
 * @returns {{ mime: string, buffer: Buffer }}
 * @throws {HttpError} 400 for a format we do not print, 413 for a file too big
 */
function parseLogo({ mime, buffer } = {}) {
  const format = LOGO_FORMATS.get(String(mime ?? '').toLowerCase())
  if (!format) {
    throw HttpError.badRequest('Unsupported image format', {
      logo: 'must be a PNG, JPEG or WebP image',
    })
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw HttpError.badRequest('The image is empty', { logo: 'must be a file with content' })
  }

  if (buffer.length > MAX_LOGO_BYTES) {
    throw new HttpError(413, 'payload_too_large', 'The image exceeds the 2 MB limit', {
      logo: 'must be at most 2 MB',
    })
  }

  const magic = format.magic.every((byte, index) => buffer[index] === byte)
  const isWebp = format.ext !== 'webp' || buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  if (!magic || !isWebp) {
    throw HttpError.badRequest('The file does not match its declared format', {
      logo: 'must be a real PNG, JPEG or WebP image',
    })
  }

  return { mime: String(mime).toLowerCase(), buffer }
}

/** Where the app asks for the image. `v` changes when the file does. */
function logoUrl(logo) {
  return `/api/ajustes/logo?v=${encodeURIComponent(logo.actualizadoEn ?? '')}`
}

/**
 * Everything the settings screen needs. `null` means "never configured", which
 * the client renders as the bundled fallback instead of a broken form.
 */
async function getAjustes() {
  const [director, logo] = await Promise.all([readValue(DIRECTOR_KEY), readValue(LOGO_KEY)])

  return {
    // Uppercased on the way out as well: a row written before this rule existed
    // (or edited by hand in the database) must not print in mixed case.
    director: director ? { ...director, nombre: upperName(director.nombre) } : null,
    logo: logo
      ? {
          url: logoUrl(logo),
          mime: logo.mime,
          bytes: Buffer.byteLength(logo.data ?? '', 'base64'),
          actualizadoEn: logo.actualizadoEn ?? null,
        }
      : null,
    positions: POSITIONS,
    maxLogoBytes: MAX_LOGO_BYTES,
  }
}

/**
 * @param {{ nombre?: unknown, ci?: unknown, cargo?: unknown }} input
 * @returns {Promise<object>} the stored director
 */
async function saveDirector(input) {
  const director = parseDirector(input)
  const { actualizadoEn } = await writeValue(DIRECTOR_KEY, director)
  return { ...director, actualizadoEn }
}

/**
 * @param {{ mime?: unknown, buffer?: unknown }} upload
 * @returns {Promise<object>} the stored logo metadata (never the bytes)
 */
async function saveLogo(upload) {
  const { mime, buffer } = parseLogo(upload)
  const logo = { mime, data: buffer.toString('base64'), actualizadoEn: stamp() }
  await writeValue(LOGO_KEY, logo)
  return { url: logoUrl(logo), mime, bytes: buffer.length, actualizadoEn: logo.actualizadoEn }
}

/**
 * The stored image, ready to be served.
 * @returns {Promise<{ mime: string, buffer: Buffer }|null>}
 */
async function getLogo() {
  const logo = await readValue(LOGO_KEY)
  if (!logo?.data) {
    return null
  }
  return { mime: logo.mime ?? 'image/png', buffer: Buffer.from(logo.data, 'base64') }
}

module.exports = {
  DIRECTOR_KEY,
  LOGO_KEY,
  POSITIONS,
  MAX_LOGO_BYTES,
  parseDirector,
  parseLogo,
  getAjustes,
  saveDirector,
  saveLogo,
  getLogo,
}
