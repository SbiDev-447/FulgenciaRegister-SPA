'use strict'

// Institutional settings and maintenance: the sitting director, the ministry
// logo printed on the letterhead, and the two housekeeping operations that used
// to need a terminal.
//
// Settings are files in `data/` (see `ajustes.almacen.js`) and not rows in the
// database. They configure the letterhead, not the record: they are two facts
// the school sets once, they belong to the installation and not to a student,
// and a human can read them when something looks wrong. The backup copies that
// directory next to the `.sql`, so a restore brings them back too.

const { HttpError } = require('../../utils/httpError')
const { parseCedula } = require('../../utils/cedula')
const store = require('./ajustes.almacen')

const LOGO_KEY = 'logo'

/** The office is a choice, not free text: a letter signs as one or the other. */
const POSITIONS = ['Director', 'Directora']

const MAX_LOGO_BYTES = 2 * 1024 * 1024

// What a browser is allowed to send, and the signature that proves the bytes
// really are that format: the declared Content-Type is the client's word, and a
// file that is not an image would be served back to the app as one. The
// extension is the one the file is stored with.
const LOGO_FORMATS = new Map([
  ['image/png', { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] }],
  ['image/jpeg', { ext: 'jpg', magic: [0xff, 0xd8, 0xff] }],
  ['image/webp', { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] }],
])

/** `2026-10-30 09:05:03`, a readable stamp that also busts the logo cache. */
function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(' ')
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
 * @returns {{ mime: string, ext: string, buffer: Buffer }}
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

  return { mime: String(mime).toLowerCase(), ext: format.ext, buffer }
}

/** Where the app asks for the image. `v` changes when the file does. */
function logoUrl(logo) {
  return `/api/ajustes/logo?v=${encodeURIComponent(logo?.actualizadoEn ?? '')}`
}

/**
 * Everything the settings screen needs. `null` means "never configured", which
 * the client renders as the bundled fallback instead of a broken form.
 */
async function getAjustes() {
  const settings = store.readSettings()
  const stored = store.readLogo(settings)

  return {
    // Uppercased on the way out as well: a file written before this rule existed
    // (or edited by hand) must not print in mixed case.
    director: settings.director
      ? { ...settings.director, nombre: upperName(settings.director.nombre) }
      : null,
    logo:
      stored && settings[LOGO_KEY]
        ? {
            url: logoUrl(settings[LOGO_KEY]),
            mime: settings[LOGO_KEY].mime ?? 'image/png',
            bytes: stored.buffer.length,
            actualizadoEn: settings[LOGO_KEY].actualizadoEn ?? null,
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
  const settings = store.readSettings()
  store.writeSettings({ ...settings, director })
  return { ...director }
}

/**
 * @param {{ mime?: unknown, buffer?: unknown }} upload
 * @returns {Promise<object>} the stored logo metadata (never the bytes)
 */
async function saveLogo(upload) {
  const { mime, ext, buffer } = parseLogo(upload)
  const { archivo } = store.writeLogo(buffer, ext)
  const logo = { archivo, mime, actualizadoEn: stamp() }
  const settings = store.readSettings()
  store.writeSettings({ ...settings, [LOGO_KEY]: logo })
  return { url: logoUrl(logo), mime, bytes: buffer.length, actualizadoEn: logo.actualizadoEn }
}

/**
 * The stored image, ready to be served.
 * @returns {Promise<{ mime: string, buffer: Buffer, actualizadoEn: string|null }|null>}
 */
async function getLogo() {
  const settings = store.readSettings()
  const stored = store.readLogo(settings)
  if (!stored) {
    return null
  }
  return {
    mime: settings[LOGO_KEY]?.mime ?? 'image/png',
    buffer: stored.buffer,
    actualizadoEn: settings[LOGO_KEY]?.actualizadoEn ?? null,
  }
}

module.exports = {
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
