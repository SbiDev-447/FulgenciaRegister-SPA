'use strict'

// The pure half of `db:dump` / `db:restore`: naming the file, and deciding
// whether a file really is a dump. Both scripts shell out to Docker, so the
// decisions worth pinning are the ones that decide WHERE a backup lands and
// whether it is safe to trust one.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  timestampFor,
  defaultDumpPath,
  looksLikeDump,
  tablesInDump,
  resolveFromRoot,
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
