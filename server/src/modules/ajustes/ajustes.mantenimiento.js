'use strict'

// The two housekeeping operations the settings screen offers. Both already
// existed as commands; what is new here is calling them from a request, so the
// rules stay where they were written and this module only reports outcomes.

const { listOrphanRepresentantes, purgeOrphanRepresentantes } = require('../../../db/purge-orphan-representantes')
const { createDump } = require('../../../db/dump')
const { HttpError } = require('../../utils/httpError')

/**
 * Representatives nobody points at: no student, no inscription, unreachable
 * from every screen. The same list `pnpm db:purge-orphans` prints.
 * @returns {Promise<{ total: number, representantes: Array<object> }>}
 */
async function listOrphans() {
  const representantes = await listOrphanRepresentantes()
  return { total: representantes.length, representantes }
}

/**
 * Delete exactly the representatives no student references. The condition is
 * evaluated inside the DELETE (in the purge command's own SQL), never from the
 * list above: a representative claimed between the preview and the click must
 * survive.
 * @returns {Promise<{ encontrados: number, eliminados: Array<object>, restantes: number }>}
 */
async function purgeOrphans() {
  const { found, deleted, remaining } = await purgeOrphanRepresentantes({ apply: true })
  return { encontrados: found.length, eliminados: deleted, restantes: remaining.length }
}

/**
 * Write a dump into `backups/` and report what it holds.
 *
 * The dump is synchronous, so it blocks the event loop while `mariadb-dump`
 * runs. That is acceptable for a single-operator school register and it is the
 * price of reusing the exact command the CLI uses; a queued job would be a
 * second implementation to keep in step.
 * @returns {{ archivo: string, bytes: number, tablas: string[], baseDeDatos: string, configuracion: string|null }}
 * @throws {HttpError} 503 when the container does not answer or the dump is unusable
 */
function backup() {
  const result = createDump()

  if (!result.ok) {
    throw new HttpError(503, 'backup_failed', result.message, {
      backup: result.detail ?? result.message,
    })
  }

  return {
    archivo: result.relative,
    bytes: result.bytes,
    tablas: result.tables,
    baseDeDatos: result.database,
    // The director and the logo are files, so they are copied beside the dump
    // instead of travelling inside it.
    configuracion: result.settings?.relative ?? null,
  }
}

module.exports = { listOrphans, purgeOrphans, backup }
