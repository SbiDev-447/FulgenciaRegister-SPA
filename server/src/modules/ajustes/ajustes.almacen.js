'use strict'

// Where the settings live on disk.
//
// The director and the logo are not student data and not history: they are the
// two facts the school configures once and expects to keep until it changes them
// again. They are files and not database rows because what they configure is the
// letterhead, not the record — and because a JSON file can be read, copied and
// inspected by a human when something looks wrong.
//
//   data/ajustes.json              the director and the logo's description
//   data/logo-ministerio.<ext>     the uploaded image, exactly as it arrived
//
// `data/` is gitignored: it holds a real person's name and cédula. The bundled
// `client/assets/skeletons/LogoMinisterio-To-Left.webp` stays untouched as the
// fallback used until somebody uploads a logo.
//
// Every write goes to a temporary file in the same directory and is renamed
// over the target. A rename is atomic, so a crash halfway through leaves the
// previous settings intact instead of a half-written JSON.

const fs = require('node:fs')
const path = require('node:path')

/** The repository root: this file lives at `server/src/modules/ajustes/`. */
const ROOT = path.resolve(__dirname, '../../../..')
const DATA_DIR = path.join(ROOT, 'data')

/**
 * The settings folder. `FULGENCIA_DATA_DIR` exists so the tests can point it at
 * a scratch directory instead of rewriting the settings of a real school; an
 * installation never sets it, and then this is exactly `data/`.
 * @returns {string}
 */
function dataDir() {
  const override = process.env.FULGENCIA_DATA_DIR
  return override ? path.resolve(override) : DATA_DIR
}

/** `<data>/ajustes.json` */
function settingsFile() {
  return path.join(dataDir(), 'ajustes.json')
}

const LOGO_BASENAME = 'logo-ministerio'
const LOGO_EXTENSIONS = ['png', 'jpg', 'webp']

function ensureDataDir() {
  fs.mkdirSync(dataDir(), { recursive: true })
}

/**
 * The settings document. A missing file is an unconfigured school, and a file
 * someone broke by hand is treated the same way: the caller falls back to the
 * bundled values instead of failing every read.
 * @returns {{ director?: object, logo?: { archivo?: string, mime?: string, actualizadoEn?: string } }}
 */
function readSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Replace the settings document in one step.
 * @param {object} settings
 * @returns {object} the same document
 */
function writeSettings(settings) {
  ensureDataDir()
  const target = settingsFile()
  const temp = `${target}.tmp`
  fs.writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`)
  fs.renameSync(temp, target)
  return settings
}

/** Absolute path of the logo for a given extension (`png`, `jpg`, `webp`). */
function logoFile(extension) {
  return path.join(dataDir(), `${LOGO_BASENAME}.${extension}`)
}

/**
 * Delete every logo except `keep`. The image is stored with its real extension,
 * so replacing a PNG with a WebP must not leave the old PNG behind to be served.
 * @param {string} [keep]
 */
function removeOtherLogos(keep) {
  for (const extension of LOGO_EXTENSIONS) {
    const file = logoFile(extension)
    if (file !== keep) {
      fs.rmSync(file, { force: true })
    }
  }
}

/**
 * Write the image bytes and drop the previous one.
 * @param {Buffer} buffer
 * @param {string} extension
 * @returns {{ archivo: string, bytes: number }}
 */
function writeLogo(buffer, extension) {
  ensureDataDir()
  const target = logoFile(extension)
  const temp = `${target}.tmp`
  fs.writeFileSync(temp, buffer)
  fs.renameSync(temp, target)
  removeOtherLogos(target)
  return { archivo: path.basename(target), bytes: buffer.length }
}

/**
 * The image the settings point at, or `null` when nothing was uploaded or the
 * file is gone. The name from the JSON is checked against the shapes this module
 * writes: a hand-edited settings file must not be able to read an arbitrary path.
 * @param {object} settings
 * @returns {{ buffer: Buffer, archivo: string } | null}
 */
function readLogo(settings) {
  const name = String(settings?.logo?.archivo ?? '')
  if (!name || path.basename(name) !== name) {
    return null
  }
  const extension = LOGO_EXTENSIONS.find((value) => name === `${LOGO_BASENAME}.${value}`)
  if (!extension) {
    return null
  }
  try {
    return { buffer: fs.readFileSync(path.join(dataDir(), name)), archivo: name }
  } catch {
    return null
  }
}

module.exports = {
  ROOT,
  DATA_DIR,
  LOGO_BASENAME,
  LOGO_EXTENSIONS,
  dataDir,
  settingsFile,
  readSettings,
  writeSettings,
  logoFile,
  writeLogo,
  readLogo,
}
