'use strict'

// The pure half of `db:dump` / `db:restore`: naming the file, and deciding
// whether a file really is a dump. Both scripts shell out to Docker, so the
// decisions worth pinning are the ones that decide WHERE a backup lands and
// whether it is safe to trust one.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const {
  timestampFor,
  defaultDumpPath,
  looksLikeDump,
  tablesInDump,
  resolveFromRoot,
  settingsDirFor,
  settingsFiles,
  copySettings,
  restoreSettings,
  ROOT,
} = require('../db/backup')

test('timestampFor builds a filename-safe local stamp', () => {
  assert.equal(timestampFor(new Date(2026, 9, 18, 9, 5, 3)), '2026-10-18-090503')
  assert.equal(timestampFor(new Date(2026, 0, 2, 23, 59, 59)), '2026-01-02-235959')
})

test('defaultDumpPath names the file after the database and the moment', () => {
  const path = defaultDumpPath({
    directory: '/repo/backups',
    database: 'fulgencia',
    date: new Date(2026, 9, 18, 9, 5, 3),
  })
  assert.equal(path, '/repo/backups/fulgencia-2026-10-18-090503.sql')
})

test('looksLikeDump rejects every way a backup comes out broken', () => {
  // The shapes that matter: a real dump, and the three ways one arrives empty.
  assert.equal(looksLikeDump('-- MariaDB dump 10.19\n\nCREATE TABLE `estudiantes` (\n  `id` int\n);'), true)
  assert.equal(looksLikeDump('CREATE TABLE IF NOT EXISTS `x` (id int);'), true)

  // A pipe that failed writes nothing, and a script that reports success on an
  // empty file is how a backup is discovered to be worthless too late.
  assert.equal(looksLikeDump(''), false)
  assert.equal(looksLikeDump('   \n\n'), false)
  assert.equal(looksLikeDump('docker: Error response from daemon: service db is not running'), false)
  assert.equal(looksLikeDump('<html><body>502 Bad Gateway</body></html>'), false)
})

test('tablesInDump lists what a restore would recreate', () => {  const sql = [
    'CREATE TABLE `estudiantes` (`id` int);',
    'CREATE TABLE IF NOT EXISTS `inscripciones` (`id` int);',
    "create table `documentos_consignados` (`id` int);",
  ].join('\n')

  assert.deepEqual(tablesInDump(sql), ['estudiantes', 'inscripciones', 'documentos_consignados'])
  assert.deepEqual(tablesInDump('-- nothing here'), [])
})

test('resolveFromRoot reads a path the way these commands print it', () => {
  // The scripts run with `server/` as the process directory, so resolving
  // against the process would turn the `backups/x.sql` that `db:dump` prints
  // into `server/backups/x.sql` — and fail on a file that is right there.
  assert.equal(resolveFromRoot('backups/fulgencia.sql'), path.join(ROOT, 'backups', 'fulgencia.sql'))
  assert.equal(resolveFromRoot('/somewhere/else.sql'), '/somewhere/else.sql')
})

test('looksLikeDump refuses what a real empty database dumps', () => {
  // A database with no tables still produces a valid dump: headers, SET
  // statements and a completion marker, and no CREATE TABLE anywhere. This is
  // the shape of the failure that matters — a file that is a genuine mariadb
  // dump but carries no data.
  const headerOnly = [
    '-- MariaDB dump 10.20  Distrib 11.4.2-MariaDB, for debian-linux-gnu (x86_64)',
    '--',
    '-- Host: localhost    Database: fulgencia',
    '/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;',
    '/*!40101 SET NAMES utf8mb4 */;',
    '-- Dump completed on 2026-10-18 17:01:26',
  ].join('\n')

  assert.equal(looksLikeDump(headerOnly), false)
})

test('resolveFromRoot also reads a ./-prefixed path from the root', () => {
  assert.equal(resolveFromRoot('./backups/x.sql'), path.join(ROOT, 'backups', 'x.sql'))
})

// The director and the logo are files, so a backup that carries only the `.sql`
// restores the students and forgets who signs the letters. These pin the rule:
// the settings travel in a folder of the same name, beside the dump.
function scratch(t) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgencia-backup-'))
  t.after(() => fs.rmSync(work, { recursive: true, force: true }))
  return work
}

test('settingsDirFor puts the settings beside the dump, not inside it', () => {
  assert.equal(
    settingsDirFor('/repo/backups/fulgencia-2026-10-30-090503.sql'),
    '/repo/backups/fulgencia-2026-10-30-090503.datos',
  )
})

test('settingsFiles lists what a backup would carry, and nothing when there is nothing', (t) => {
  const work = scratch(t)
  assert.deepEqual(settingsFiles(path.join(work, 'nada')), [])

  fs.mkdirSync(path.join(work, 'data'))
  fs.writeFileSync(path.join(work, 'data', 'logo-ministerio.webp'), 'x')
  fs.writeFileSync(path.join(work, 'data', 'ajustes.json'), '{}')
  assert.deepEqual(settingsFiles(path.join(work, 'data')), ['ajustes.json', 'logo-ministerio.webp'])
})

test('copySettings copies the folder next to the dump and replaces an older copy', (t) => {
  const work = scratch(t)
  const source = path.join(work, 'data')
  const file = path.join(work, 'fulgencia-2026-10-30-090503.sql')
  fs.mkdirSync(source)
  fs.writeFileSync(path.join(source, 'ajustes.json'), '{"director":null}')

  const first = copySettings(file, source)
  assert.deepEqual(first.files, ['ajustes.json'])
  assert.deepEqual(fs.readdirSync(settingsDirFor(file)), ['ajustes.json'])

  // A second backup in the same second must not leave the previous file behind.
  fs.writeFileSync(path.join(source, 'logo-ministerio.png'), 'px')
  const second = copySettings(file, source)
  assert.deepEqual(second.files, ['ajustes.json', 'logo-ministerio.png'])
  assert.deepEqual(fs.readdirSync(settingsDirFor(file)).sort(), ['ajustes.json', 'logo-ministerio.png'])
})

test('copySettings reports nothing to carry instead of failing an empty school', (t) => {
  const work = scratch(t)
  fs.mkdirSync(path.join(work, 'data'))
  assert.equal(copySettings(path.join(work, 'x.sql'), path.join(work, 'data')), null)
})

test('restoreSettings swaps the folder in whole, never half of each', (t) => {
  const work = scratch(t)
  const file = path.join(work, 'fulgencia-2026-10-30-090503.sql')
  const backup = settingsDirFor(file)
  const destination = path.join(work, 'data')

  fs.mkdirSync(backup)
  fs.writeFileSync(path.join(backup, 'ajustes.json'), '{"director":"ANA"}')

  fs.mkdirSync(destination)
  fs.writeFileSync(path.join(destination, 'logo-viejo.png'), 'old')

  const result = restoreSettings(file, destination)
  assert.deepEqual(result.files, ['ajustes.json'])
  assert.deepEqual(fs.readdirSync(destination), ['ajustes.json'])
  assert.equal(fs.readFileSync(path.join(destination, 'ajustes.json'), 'utf8'), '{"director":"ANA"}')
  // The staging folder is moved into place, not left behind.
  assert.equal(fs.existsSync(`${destination}.restaurando`), false)
})

test('restoreSettings leaves the settings alone when the dump has none beside it', (t) => {
  const work = scratch(t)
  const destination = path.join(work, 'data')
  fs.mkdirSync(destination)
  fs.writeFileSync(path.join(destination, 'ajustes.json'), '{"director":"ACTUAL"}')

  assert.equal(restoreSettings(path.join(work, 'sin-datos.sql'), destination), null)
  assert.equal(fs.readFileSync(path.join(destination, 'ajustes.json'), 'utf8'), '{"director":"ACTUAL"}')
})

test('copySettings never copies the settings folder into a folder inside itself', (t) => {
  // Regression: `db:dump --out data/x.sql` wrote the dump and then crashed,
  // because the settings folder was copied into `data/x.datos` — a folder
  // inside the thing being copied. A flag value must not turn a dump into an
  // exception after the file is already on disk.
  const work = scratch(t)
  const source = path.join(work, 'data')
  fs.mkdirSync(path.join(source, 'sub'), { recursive: true })
  fs.writeFileSync(path.join(source, 'ajustes.json'), '{}')

  const result = copySettings(path.join(source, 'backup.sql'), source)
  assert.equal(result.skipped, 'inside')
  assert.equal(result.directory, null)
  assert.deepEqual(fs.readdirSync(source).sort(), ['ajustes.json', 'sub'])
  assert.deepEqual(fs.readdirSync(path.join(source, 'sub')), [])

  // The same holds one level down: the check is "inside", not "one name deep".
  const nested = copySettings(path.join(source, 'sub', 'backup.sql'), source)
  assert.equal(nested.skipped, 'inside')
})

test('copySettings still copies into a folder beside the settings', (t) => {
  const work = scratch(t)
  const source = path.join(work, 'data')
  fs.mkdirSync(source)
  fs.writeFileSync(path.join(source, 'ajustes.json'), '{}')

  const sibling = copySettings(path.join(work, 'otra', 'backup.sql'), source)
  assert.equal(sibling.skipped, null)
  assert.deepEqual(fs.readdirSync(sibling.directory), ['ajustes.json'])
})
