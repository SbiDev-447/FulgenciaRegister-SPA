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

// The settings the school configures (the sitting director and the printed
// logo) are files, not rows, so they do not travel inside the `.sql`. They are
// copied next to it, in a folder of the same name, and a restore puts them back:
// a backup that brings the students and forgets who signs the letters is not a
// backup of this application.
const DATA = path.join(ROOT, 'data')

/**
 * The settings folder. `FULGENCIA_DATA_DIR` lets a test point it at a scratch
 * directory; a real installation never sets it, so it means `data/`.
 * @returns {string}
 */
function dataDir() {
  const override = process.env.FULGENCIA_DATA_DIR
  return override ? path.resolve(override) : DATA
}

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

/** `backups/fulgencia-2026-10-30-090503.datos` for `…-090503.sql`. */
function settingsDirFor(file) {
  const parsed = path.parse(file)
  return path.join(parsed.dir, `${parsed.name}.datos`)
}

/** Files inside `data/`, so a backup and its output report what it carries. */
function settingsFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort()
}

/**
 * Copy the settings folder next to the dump. Nothing to copy is not a failure: a
 * school that never configured the letterhead has no settings yet.
 *
 * A dump written inside the settings folder itself (`--out data/x.sql`) is not
 * copied and is not an error either: the destination would be a folder inside
 * the thing being copied, and the copy would carry the dump it is backing up.
 * @param {string} file - the `.sql` the settings travel with
 * @param {string} [source] - the settings folder (defaults to `data/`)
 * @returns {{ directory: string|null, relative: string|null, files: string[], skipped: 'inside'|null } | null}
 */
function copySettings(file, source = dataDir()) {
  const files = settingsFiles(source)
  if (files.length === 0) return null

  const directory = settingsDirFor(file)
  const inside =
    path.resolve(directory).startsWith(`${path.resolve(source)}${path.sep}`) ||
    path.resolve(directory) === path.resolve(source)
  if (inside) {
    return { directory: null, relative: null, files, skipped: 'inside' }
  }

  fs.rmSync(directory, { recursive: true, force: true })
  fs.cpSync(source, directory, { recursive: true })
  return { directory, relative: path.relative(ROOT, directory), files, skipped: null }
}

/**
 * Put a settings folder back into `data/`. Copied to a staging folder first and
 * swapped in at the end, so the settings a school has right now are either the
 * old ones or the restored ones — never half of each.
 * @param {string} file - the `.sql` whose settings folder is being restored
 * @param {string} [destination] - the settings folder (defaults to `data/`)
 * @returns {{ relative: string, files: string[] } | null}
 */
function restoreSettings(file, destination = dataDir()) {
  const directory = settingsDirFor(file)
  const files = settingsFiles(directory)
  if (files.length === 0) return null

  const staging = `${destination}.restaurando`
  fs.rmSync(staging, { recursive: true, force: true })
  fs.cpSync(directory, staging, { recursive: true })
  fs.rmSync(destination, { recursive: true, force: true })
  fs.renameSync(staging, destination)
  return { relative: path.relative(ROOT, destination), files }
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
  settingsDirFor,
  settingsFiles,
  copySettings,
  restoreSettings,
  ROOT,
  BACKUPS,
  DATA,
  dataDir,
}
