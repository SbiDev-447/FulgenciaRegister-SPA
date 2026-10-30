'use strict'

// `pnpm db:dump [--out <ruta>]`
//
// Write a SQL backup of the live database into `backups/`, which is gitignored:
// it holds real student data and must never be committed.
//
// This is what travels when the project moves. The project folder carries the
// recipe for the database — docker-compose.yml, the models, the seed — and
// never its contents, so a fresh clone on another machine gives a working
// application with an empty school in it. This file is the missing half.
//
// The work is a function so the settings screen can offer the same backup, with
// the same guarantees, without a terminal. The command stays as the thin shell
// around it.

const fs = require('node:fs')
const path = require('node:path')
const { parseArgs } = require('node:util')

const {
  defaultDumpPath,
  looksLikeDump,
  resolveFromRoot,
  tablesInDump,
  inContainer,
  databaseName,
  ROOT,
  BACKUPS,
} = require('./backup')

// `--single-transaction`: one consistent snapshot, so a row written halfway
// through a dump cannot end up inside it in pieces.
const DUMP = 'exec mariadb-dump --single-transaction -uroot -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"'

/**
 * A free path: two backups asked for in the same second must not overwrite each
 * other, and the second one silently replacing the first is exactly the kind of
 * loss a backup is supposed to prevent.
 * @param {string} file
 * @returns {string}
 */
function freePath(file) {
  if (!fs.existsSync(file)) {
    return file
  }
  const parsed = path.parse(file)
  for (let copy = 2; copy < 1000; copy += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${copy}${parsed.ext}`)
    if (!fs.existsSync(candidate)) {
      return candidate
    }
  }
  return file
}

/**
 * Dump the live database to a `.sql` file.
 * @param {{ out?: string }} [options] - `out` overrides the default file name
 * @returns {{ ok: true, file: string, relative: string, bytes: number, database: string, tables: string[] }
 *   | { ok: false, message: string, detail?: string }}
 */
function createDump({ out } = {}) {
  const database = databaseName()
  if (!database.ok) {
    return {
      ok: false,
      message: 'The database container is not answering, so there is nothing to dump.',
      detail: `Start it with "pnpm db:up". ${database.detail}`,
    }
  }

  const target =
    out === undefined || out === null
      ? defaultDumpPath({ directory: BACKUPS, database: database.name, date: new Date() })
      : resolveFromRoot(out)
  const file = freePath(target)
  fs.mkdirSync(path.dirname(file), { recursive: true })

  // Streamed straight to the file: a dump never has to fit in memory.
  const descriptor = fs.openSync(file, 'w')
  let result
  try {
    result = inContainer(DUMP, { stdio: ['ignore', descriptor, 'pipe'] })
  } finally {
    fs.closeSync(descriptor)
  }

  if (result.error || result.status !== 0) {
    fs.rmSync(file, { force: true })
    return {
      ok: false,
      message: 'The dump failed, so no file was kept.',
      detail: result.error ? result.error.message : String(result.stderr ?? ''),
    }
  }

  const sql = fs.readFileSync(file, 'utf8')
  if (!looksLikeDump(sql)) {
    // The failure that hurts is not a missing file: it is a file created anyway
    // by a command that failed, which looks like a backup until the day it is
    // needed.
    fs.rmSync(file, { force: true })
    return {
      ok: false,
      message: 'The database answered with something that is not a dump, so the file was removed.',
    }
  }

  return {
    ok: true,
    file,
    relative: path.relative(ROOT, file),
    bytes: fs.statSync(file).size,
    database: database.name,
    tables: tablesInDump(sql),
  }
}

function main() {
  const { values } = parseArgs({ options: { out: { type: 'string' } }, allowPositionals: true })

  const result = createDump({ out: values.out })

  if (!result.ok) {
    console.error(result.message)
    if (result.detail && result.detail.trim()) console.error(`  ${result.detail.trim()}`)
    process.exitCode = 1
    return
  }

  const size = (result.bytes / 1024).toFixed(1)
  console.log(`Backup written: ${result.relative} (${size} KB)`)
  console.log(`Database "${result.database}": ${result.tables.length} table(s) — ${result.tables.join(', ')}`)
  console.log(`To put it back on this machine: pnpm db:restore ${result.relative}`)
  console.log('To put it back on another one: copy the file there and run the same command.')
}

// The server requires this module; the command must not run on import.
if (require.main === module) {
  main()
}

module.exports = { createDump }
