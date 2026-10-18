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

function fail(message, detail) {
  console.error(message)
  if (detail && detail.trim()) console.error(`  ${detail.trim()}`)
  process.exitCode = 1
}

function main() {
  const { values } = parseArgs({ options: { out: { type: 'string' } }, allowPositionals: true })

  const database = databaseName()
  if (!database.ok) {
    return fail(
      'The database container is not answering, so there is nothing to dump.',
      `Start it with "pnpm db:up". ${database.detail}`,
    )
  }

  const out =
    values.out === undefined
      ? defaultDumpPath({ directory: BACKUPS, database: database.name, date: new Date() })
      : resolveFromRoot(values.out)
  fs.mkdirSync(path.dirname(out), { recursive: true })

  // Streamed straight to the file: a dump never has to fit in memory.
  const descriptor = fs.openSync(out, 'w')
  let result
  try {
    result = inContainer(DUMP, { stdio: ['ignore', descriptor, 'pipe'] })
  } finally {
    fs.closeSync(descriptor)
  }

  if (result.error || result.status !== 0) {
    fs.rmSync(out, { force: true })
    return fail(
      'The dump failed, so no file was kept.',
      result.error ? result.error.message : String(result.stderr ?? ''),
    )
  }

  const sql = fs.readFileSync(out, 'utf8')
  if (!looksLikeDump(sql)) {
    // The failure that hurts is not a missing file: it is a file created anyway
    // by a command that failed, which looks like a backup until the day it is
    // needed.
    fs.rmSync(out, { force: true })
    return fail('The database answered with something that is not a dump, so the file was removed.')
  }

  const tables = tablesInDump(sql)
  const size = (fs.statSync(out).size / 1024).toFixed(1)
  console.log(`Backup written: ${path.relative(ROOT, out)} (${size} KB)`)
  console.log(`Database "${database.name}": ${tables.length} table(s) — ${tables.join(', ')}`)
  console.log(`To put it back on this machine: pnpm db:restore ${path.relative(ROOT, out)}`)
  console.log('To put it back on another one: copy the file there and run the same command.')
}

main()
