'use strict'

// Everything `db:dump` and `db:restore` share: where a backup lands, whether a
// file can be trusted, and how to talk to the running database.
//
// The database lives in a container, so every command goes through Docker. Two
// decisions are worth stating:
//
// - The credentials and the database name come from the CONTAINER's own
//   environment (`MARIADB_*`, set by docker-compose.yml), never from `.env`.
//   The running database is the source of truth for what it can dump, and this
//   way a backup works on a machine where the project was just cloned and
//   `.env` does not exist yet — the machine being moved to.
// - `-T` on every `exec`: without it Docker allocates a TTY and corrupts
//   anything streamed through a pipe, which is exactly how a dump is written.

const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const BACKUPS = path.join(ROOT, 'backups')

/**
 * Local, filename-safe stamp: `2026-10-18-090503`. Local time on purpose: the
 * person reading the folder wants to know when they took the backup, not what
 * UTC thought about it.
 * @param {Date} date
 * @returns {string}
 */
function timestampFor(date) {
  const pad = (value) => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `${day}-${time}`
}

/**
 * `<directory>/<database>-<stamp>.sql`
 * @param {{ directory: string, database: string, date: Date }} options
 * @returns {string}
 */
function defaultDumpPath({ directory, database, date }) {
  return path.join(directory, `${database}-${timestampFor(date)}.sql`)
}

/**
 * Is this file a database dump? A backup is only worth the confidence someone
 * has in it, and the failure that hurts is not a missing file: it is a file
 * created anyway by a command that failed — empty, or full of an error message
 * — which looks like a backup until the day it is needed.
 * @param {string} sql
 * @returns {boolean}
 */
function looksLikeDump(sql) {
  return /CREATE TABLE/i.test(String(sql ?? ''))
}

/**
 * The tables a dump would recreate, in file order. Printed before a restore so
 * the person can see what the file actually carries.
 * @param {string} sql
 * @returns {string[]}
 */
function tablesInDump(sql) {
  const tables = []
  const pattern = /CREATE TABLE(?: IF NOT EXISTS)?\s+[`"]?([A-Za-z0-9_$]+)[`"]?/gi
  for (const match of String(sql ?? '').matchAll(pattern)) {
    if (!tables.includes(match[1])) tables.push(match[1])
  }
  return tables
}

/**
 * Resolve a path a person typed the way these commands print it: from the
 * repository root. The scripts run with `server/` as the process directory, so
 * resolving against the process would turn `backups/x.sql` — the exact text
 * `db:dump` prints — into `server/backups/x.sql` and fail on a file that is
 * right there.
 * @param {string} target
 * @returns {string}
 */
function resolveFromRoot(target) {
  return path.isAbsolute(target) ? target : path.resolve(ROOT, target)
}

/**
 * Run a shell command inside the `db` service, from the repository root.
 * @param {string} shellCommand
 * @param {import('node:child_process').SpawnSyncOptions} [options]
 */
function inContainer(shellCommand, options = {}) {
  return spawnSync('docker', ['compose', 'exec', '-T', 'db', 'sh', '-c', shellCommand], {
    cwd: ROOT,
    ...options,
  })
}

/** The database the container was created with. */
function databaseName() {
  const result = inContainer('printf %s "$MARIADB_DATABASE"', { encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    return { ok: false, detail: result.error ? result.error.message : String(result.stderr ?? '') }
  }
  return { ok: true, name: result.stdout.trim() }
}

/**
 * Run `sql` with the MariaDB client against `database`, inside the container.
 * The database name travels as an environment variable and is quoted by the
 * container's own shell, so a name typed by a person cannot become a command.
 * @param {string} database
 * @param {string} sql
 * @param {import('node:child_process').SpawnSyncOptions} [options]
 */
function query(database, sql, options = {}) {
  return spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      '-e',
      `TARGET_DB=${database}`,
      '-e',
      `SQL=${sql}`,
      'db',
      'sh',
      '-c',
      'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -N -B "$TARGET_DB" -e "$SQL"',
    ],
    { cwd: ROOT, encoding: 'utf8', ...options },
  )
}

/**
 * Tables in `database` right now, or null when the database does not exist.
 * @param {string} database
 * @returns {string[] | null}
 */
function tablesIn(database) {
  const result = query(database, 'SHOW TABLES')
  if (result.status !== 0) return null
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * Feed a `.sql` file to the MariaDB client against `database`, inside the
 * container. Streamed from the file descriptor, so a backup never has to fit in
 * memory, and the name travels as an environment variable rather than inside a
 * shell string.
 * @param {string} database
 * @param {string} file
 */
function importDump(database, file) {
  const descriptor = fs.openSync(file, 'r')
  try {
    return spawnSync(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        '-e',
        `TARGET_DB=${database}`,
        'db',
        'sh',
        '-c',
        'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$TARGET_DB"',
      ],
      { cwd: ROOT, stdio: [descriptor, 'inherit', 'pipe'] },
    )
  } finally {
    fs.closeSync(descriptor)
  }
}

module.exports = {
  timestampFor,
  resolveFromRoot,
  defaultDumpPath,
  looksLikeDump,
  tablesInDump,
  inContainer,
  databaseName,
  query,
  tablesIn,
  importDump,
  ROOT,
  BACKUPS,
}
