'use strict'

const db = require('../src/config/db')

// A table is created once, by the first `db.createAllTables()`, and the model is
// never applied to it again. So a column that turns out to be too small keeps
// rejecting real data on every database built before the fix — the code is right
// and the rows are wrong, and nothing in the repository says so.
//
// This applies the widenings listed below and refuses anything else. Widening a
// varchar cannot truncate: every value that fitted before still fits. Narrowing
// is not implemented on purpose, because it can silently destroy data.
const WIDENINGS = [
  {
    table: 'estudiantes',
    column: 'lateralidad',
    type: 'varchar(20)',
    // The wizard offers 'Derecha', 'Izquierda' and 'Ambidiestro'; the last one is
    // 11 characters and varchar(10) rejected it with ER_DATA_TOO_LONG, which the
    // API turned into a bare 500 the user could do nothing with.
    because: "'Ambidiestro', offered by the form, needs 11 characters",
  },
]

/** Read one column of a table, or null when it does not exist. */
async function readColumn(table, column) {
  const rows = await db.query(`SHOW COLUMNS FROM \`${table}\``)
  const found = rows.find((row) => row.Field === column)
  if (!found) return null
  return { type: String(found.Type), nullable: found.Null === 'YES', default: found.Default }
}

/** The length of a `varchar(n)` (or `char(n)`) type, or null for anything else. */
function varcharLength(type) {
  const match = /^(?:var)?char\((\d+)\)$/i.exec(String(type).trim())
  return match ? Number(match[1]) : null
}

/**
 * What each declared widening needs, without touching the database.
 * @returns {Promise<Array<{ table: string, column: string, type: string, because: string,
 *   currentType: string|null, applied: boolean, reason?: string, sql?: string }>>}
 */
async function planWidenings() {
  const plan = []

  for (const entry of WIDENINGS) {
    const current = await readColumn(entry.table, entry.column)
    const wanted = varcharLength(entry.type)

    if (wanted === null) {
      plan.push({ ...entry, currentType: current?.type ?? null, applied: false, reason: 'the target type is not a varchar' })
      continue
    }
    if (current === null) {
      plan.push({ ...entry, currentType: null, applied: false, reason: 'the column does not exist' })
      continue
    }

    const have = varcharLength(current.type)
    if (have === null) {
      // A column that is not a varchar is not this tool's business: converting it
      // would rewrite the data, which is exactly what a widening must never do.
      plan.push({
        ...entry,
        currentType: current.type,
        applied: false,
        reason: `the column is ${current.type}, not a varchar`,
      })
      continue
    }
    if (have >= wanted) {
      plan.push({ ...entry, currentType: current.type, applied: true })
      continue
    }

    plan.push({
      ...entry,
      currentType: current.type,
      applied: false,
      sql: `ALTER TABLE \`${entry.table}\` MODIFY \`${entry.column}\` ${entry.type} ${
        current.nullable ? 'NULL DEFAULT NULL' : 'NOT NULL'
      }`,
    })
  }

  return plan
}

/**
 * Apply every pending widening. Each one is read back from the database, so the
 * report is what happened and not what was attempted.
 * @returns {Promise<{ applied: Array<object>, skipped: Array<object>, failed: Array<object> }>}
 */
async function applyWidenings() {
  const plan = await planWidenings()
  const applied = []
  const skipped = []
  const failed = []

  for (const entry of plan) {
    if (entry.applied || !entry.sql) {
      skipped.push(entry)
      continue
    }

    try {
      await db.query(entry.sql)
      const after = await readColumn(entry.table, entry.column)
      // Both the old and the new type are kept: the line below reports what was
      // read back, never merely what the ALTER was asked to do.
      applied.push({ ...entry, previousType: entry.currentType, currentType: after?.type ?? null })
    } catch (error) {
      failed.push({ ...entry, error: error.message })
    }
  }

  return { applied, skipped, failed }
}

const APPLY_FLAG = '--apply'

function describe(entry) {
  const state = entry.currentType ? `${entry.currentType} -> ${entry.type}` : `missing -> ${entry.type}`
  return `  ${entry.table}.${entry.column}  ${state}  (${entry.because})`
}

async function main() {
  const args = process.argv.slice(2)
  const unknown = args.filter((arg) => arg !== APPLY_FLAG)
  if (unknown.length > 0) {
    // A typo must not be mistaken for a plain dry run.
    console.error(
      `Unknown option(s): ${unknown.join(', ')}. Run without flags to see what is pending, or with ${APPLY_FLAG} to apply it.`,
    )
    process.exit(1)
  }

  const apply = args.includes(APPLY_FLAG)
  const plan = await planWidenings()
  const pending = plan.filter((entry) => !entry.applied)

  if (!apply) {
    console.log('Dry run: nothing will be changed. Add --apply to apply it.')
  }

  if (pending.length === 0) {
    console.log(`Nothing to repair: ${plan.length} column(s) already hold every value the app can send.`)
    return
  }

  console.log(`${pending.length} column(s) too small:`)
  for (const entry of pending) {
    console.log(describe(entry))
    if (entry.reason) {
      console.log(`    refuses to guess: ${entry.reason}`)
    }
  }

  if (!apply) {
    console.log('\nNothing was changed. Run "pnpm db:repair-schema --apply" to widen exactly these columns.')
    return
  }

  const { applied, failed } = await applyWidenings()

  for (const entry of applied) {
    console.log(`\nRepaired ${entry.table}.${entry.column}: ${entry.previousType} -> ${entry.currentType}`)
  }
  for (const entry of failed) {
    console.error(`\nCould not repair ${entry.table}.${entry.column}: ${entry.error}`)
  }

  const after = await planWidenings()
  const stillSmall = after.filter((entry) => !entry.applied)
  console.log(
    stillSmall.length === 0
      ? `\nDone: ${applied.length} column(s) widened.`
      : `\n${stillSmall.length} column(s) still too small.`,
  )

  if (failed.length > 0) {
    process.exit(1)
  }
}

// The test suite requires this module; the command must not run on import.
if (require.main === module) {
  main()
    .then(() => db.end())
    .catch((error) => {
      console.error('Repair failed:', error)
      process.exit(1)
    })
}

module.exports = { planWidenings, applyWidenings, varcharLength }
