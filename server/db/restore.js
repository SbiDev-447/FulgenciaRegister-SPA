'use strict'

// `pnpm db:restore [archivo] [--database <nombre>] [--apply]`
//
// Put a backup back. Nothing is written without `--apply`: this is the one
// command in the repository that can replace every row a school has, so the
// default run only says what would happen.
//
// `--database` restores into a different database — inspecting a backup without
// touching the live one — and it is also how the destructive path was verified
// without risking real data.

const fs = require('node:fs')
const path = require('node:path')
const { parseArgs } = require('node:util')

const {
  looksLikeDump,
  resolveFromRoot,
  tablesInDump,
  query,
  databaseName,
  tablesIn,
  importDump,
  ROOT,
  BACKUPS,
} = require('./backup')

function fail(message, detail) {
  console.error(message)
  if (detail && detail.trim()) console.error(`  ${detail.trim()}`)
  process.exitCode = 1
}

/** The newest file in `backups/`, so the common case needs no argument. */
function newestBackup() {
  if (!fs.existsSync(BACKUPS)) return null
  const files = fs
    .readdirSync(BACKUPS)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => path.join(BACKUPS, name))
  if (files.length === 0) return null
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
}

function countIn(database, table) {
  const result = query(database, `SELECT COUNT(*) FROM \`${table}\``)
  if (result.status !== 0) return null
  return Number(result.stdout.trim())
}

function main() {
  const { values, positionals } = parseArgs({
    options: {
      database: { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })

  const file = positionals[0] ? resolveFromRoot(positionals[0]) : newestBackup()
  if (!file) return fail('There is no backup to restore: pass a file, or run "pnpm db:dump" first.')
  if (!fs.existsSync(file)) return fail(`There is no file at ${file}, so nothing was touched.`)

  const sql = fs.readFileSync(file, 'utf8')
  if (!looksLikeDump(sql)) {
    return fail(`${path.relative(ROOT, file)} is not a database dump, so nothing was touched.`)
  }

  const container = databaseName()
  if (!container.ok) {
    return fail(
      'The database container is not answering, so nothing was touched.',
      `Start it with "pnpm db:up". ${container.detail}`,
    )
  }

  const target = values.database ?? container.name
  const tables = tablesInDump(sql)
  const size = (fs.statSync(file).size / 1024).toFixed(1)
  const existing = tablesIn(target)

  console.log(`Backup:        ${path.relative(ROOT, file)} (${size} KB)`)
  console.log(`Database:      "${target}"${values.database ? '' : ' (the one the container uses)'}`)
  console.log(`The backup carries ${tables.length} table(s): ${tables.join(', ')}`)

  if (!existing) {
    return fail(
      `The database "${target}" does not exist, so nothing was touched.`,
      `Create it first: docker compose exec db mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -e 'CREATE DATABASE \`${target}\`'`,
    )
  }

  const students = existing.includes('estudiantes') ? countIn(target, 'estudiantes') : null
  const school = students === null ? `${existing.length} table(s)` : `${existing.length} table(s) and ${students} student(s)`
  console.log(`Right now it has ${school}. A restore replaces the tables the backup carries;`)
  console.log('tables that are not in the backup are left alone.')

  if (!values.apply) {
    console.log('')
    console.log('Nothing was written. To go ahead, run the same command with --apply:')
    console.log(`  pnpm db:restore ${path.relative(ROOT, file)} --apply`)
    console.log('To keep what is there right now first: pnpm db:dump')
    return
  }

  const result = importDump(target, file)
  if (result.error || result.status !== 0) {
    return fail(
      `The restore into "${target}" failed.`,
      result.error ? result.error.message : String(result.stderr ?? ''),
    )
  }

  const after = tablesIn(target) ?? []
  const restored = after.includes('estudiantes') ? countIn(target, 'estudiantes') : null
  console.log('')
  console.log(
    restored === null
      ? `Restored into "${target}": ${after.length} table(s).`
      : `Restored into "${target}": ${after.length} table(s), ${restored} student(s).`,
  )
  console.log('Restart the API if it is running, so it does not keep state from before the restore.')
}

main()
