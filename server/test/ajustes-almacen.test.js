'use strict'

// The settings store: the director and the logo as files in `data/`. No database
// and no `.env`, which is why these run in the always-on suite — the thing worth
// pinning is that a save survives, and that a broken file degrades to "nothing
// configured" instead of taking every read down with it.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const store = require('../src/modules/ajustes/ajustes.almacen')

// The suite points the store at a scratch folder: it rewrites settings that a
// school may have configured, and no test gets to touch the real `data/` — Node
// runs test files in parallel, so two suites sharing that folder could restore
// one snapshot over the other's work.
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgencia-almacen-'))
process.env.FULGENCIA_DATA_DIR = path.join(work, 'data')

test.after(() => {
  fs.rmSync(work, { recursive: true, force: true })
})

test('an unconfigured school reads as an empty document', () => {
  fs.rmSync(store.dataDir(), { recursive: true, force: true })
  assert.deepEqual(store.readSettings(), {})
})

test('a settings file broken by hand does not break every read', () => {
  fs.mkdirSync(store.dataDir(), { recursive: true })
  fs.writeFileSync(store.settingsFile(), '{ this is not json')
  assert.deepEqual(store.readSettings(), {})

  fs.writeFileSync(store.settingsFile(), 'null')
  assert.deepEqual(store.readSettings(), {})
})

test('writing leaves valid JSON and no temporary file behind', () => {
  const settings = { director: { nombre: 'ANA', ci: 'V-12345678', cargo: 'Directora' } }
  store.writeSettings(settings)

  const text = fs.readFileSync(store.settingsFile(), 'utf8')
  assert.deepEqual(JSON.parse(text), settings)
  assert.ok(text.endsWith('\n'), 'the file should end with a newline')
  assert.equal(fs.existsSync(`${store.settingsFile()}.tmp`), false)
})

test('the logo is stored with its real extension and replaces the old one', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  const webp = Buffer.from([0x52, 0x49, 0x46, 0x46])

  const first = store.writeLogo(png, 'png')
  assert.equal(first.archivo, 'logo-ministerio.png')
  assert.deepEqual(fs.readFileSync(store.logoFile('png')), png)

  const second = store.writeLogo(webp, 'webp')
  assert.equal(second.archivo, 'logo-ministerio.webp')
  assert.deepEqual(fs.readFileSync(store.logoFile('webp')), webp)
  assert.equal(
    fs.existsSync(store.logoFile('png')),
    false,
    'the previous image must not stay behind to be served',
  )
})

test('reading the logo only follows names this module writes', () => {
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  store.writeLogo(buffer, 'png')

  assert.deepEqual(store.readLogo({ logo: { archivo: 'logo-ministerio.png' } }).buffer, buffer)
  // A hand-edited settings file must not turn the logo route into a file reader.
  assert.equal(store.readLogo({ logo: { archivo: '../../.env' } }), null)
  assert.equal(store.readLogo({ logo: { archivo: 'otra-cosa.png' } }), null)
  assert.equal(store.readLogo({ logo: { archivo: 'logo-ministerio.png/../../.env' } }), null)
  assert.equal(store.readLogo({}), null)
})

test('a logo whose file disappeared reads as missing, not as an error', () => {
  store.writeLogo(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'png')
  fs.rmSync(store.logoFile('png'), { force: true })

  assert.equal(store.readLogo({ logo: { archivo: 'logo-ministerio.png' } }), null)
})
