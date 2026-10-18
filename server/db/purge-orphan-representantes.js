'use strict'

const db = require('../src/config/db')

// A representative is shared by siblings: identity is (tipo_ci, numero_ci) and
// its row is only ever linked, never owned. So the safe rule is "delete it when
// the LAST student lets go" — never "delete whatever this operation unlinked".
//
// The check and the delete are one SQL statement on purpose. Reading a snapshot
// and then deleting it would race with an inscription linking that
// representative in between, and would remove a row another student had just
// claimed; here the "no student left" condition is evaluated at delete time.
const NO_STUDENT_LEFT =
  'NOT EXISTS (SELECT 1 FROM estudiante_representante l WHERE l.representante_id = representantes.id)'

const LIST_FIELDS = ['id', 'tipo_ci', 'numero_ci', 'nombre', 'telefono', 'correo']

/**
 * Representatives with no link at all: unreachable from every screen and every
 * endpoint, because nothing points at them.
 * @returns {Promise<Array<object>>}
 */
function listOrphanRepresentantes() {
  return db.tabla('representantes').select(LIST_FIELDS, null, NO_STUDENT_LEFT, null, null, 'id')
}

/**
 * Delete representatives no student points at.
 * @param {{ apply?: boolean, ids?: number[] }} [options] - `apply: false` only
 *   reports and never writes. `ids` restricts the sweep to those
 *   representatives, which must still have no student; the test suite uses it
 *   so a shared development database keeps the rows nobody approved yet.
 * @returns {Promise<{ found: Array<object>, deleted: Array<object>, remaining: Array<object> }>}
 */
async function purgeOrphanRepresentantes({ apply = false, ids } = {}) {
  const orphans = await listOrphanRepresentantes()
  const found = ids ? orphans.filter((rep) => ids.includes(rep.id)) : orphans

  if (!apply || found.length === 0) {
    return { found, deleted: [], remaining: orphans }
  }

  // Ids come from the rows just read, never from outside input.
  const scope = found.map((rep) => Number(rep.id))
  const where = ids ? `${NO_STUDENT_LEFT} AND id IN (${scope.join(', ')})` : NO_STUDENT_LEFT

  await db.beginTransaction()
  try {
    await db.tabla('representantes').delete(where)
    await db.commit()
  } catch (error) {
    await db.rollback().catch(() => {})
    throw error
  }

  // Read back instead of assuming: the report comes from the database. A row can
  // be missing from the orphan list either because this run deleted it or because
  // an inscription claimed it in between, and only a lookup tells them apart.
  const survivors = await db.tabla('representantes').select(['id'], null, { id: scope }, null, null, null)
  const aliveIds = new Set(survivors.map((rep) => rep.id))
  return {
    found,
    deleted: found.filter((rep) => !aliveIds.has(rep.id)),
    remaining: await listOrphanRepresentantes(),
  }
}

const APPLY_FLAG = '--apply'

function describe(rep) {
  const contact = [rep.telefono, rep.correo].filter(Boolean).join(' · ')
  return `  #${rep.id}  ${rep.tipo_ci}-${rep.numero_ci}  ${rep.nombre}${contact ? `  (${contact})` : ''}`
}

async function main() {
  const args = process.argv.slice(2)
  const unknown = args.filter((arg) => arg !== APPLY_FLAG)
  if (unknown.length > 0) {
    // A typo must not be mistaken for a plain dry run.
    console.error(
      `Unknown option(s): ${unknown.join(', ')}. Run without flags to see what would go, or with ${APPLY_FLAG} to delete.`,
    )
    process.exit(1)
  }

  const apply = args.includes(APPLY_FLAG)

  if (!apply) {
    console.log('Dry run: nothing will be deleted. Add --apply to delete.')
  }

  const { found, deleted } = await purgeOrphanRepresentantes({ apply })

  if (found.length === 0) {
    console.log('No representative is left without a student.')
    return
  }

  console.log(`${found.length} representative(s) with no student:`)
  for (const rep of found) {
    console.log(describe(rep))
  }

  if (!apply) {
    console.log('\nNothing was deleted. Run "pnpm db:purge-orphans --apply" to delete exactly these rows.')
    return
  }

  console.log(`\nDeleted ${deleted.length} representative(s).`)
}

// The test suite requires this module; the command must not run on import.
if (require.main === module) {
  main()
    .then(() => db.end())
    .catch((error) => {
      console.error('Purge failed:', error)
      process.exit(1)
    })
}

module.exports = { listOrphanRepresentantes, purgeOrphanRepresentantes }
