'use strict'

/**
 * MySQL refuses a value a column cannot hold — too long, out of range, wrong
 * type — with a driver error, not a validation error. Left alone it reached the
 * client as 500 `internal_error`, a dead end that names nothing: the user saw
 * "Ocurrió un error en el servidor" after storing 'Ambidiestro' in a varchar(10)
 * and had no way to know which field to fix.
 *
 * The driver does name the column it refused, so this maps those codes to the
 * same `details` shape the controllers produce, reusing their English reason
 * vocabulary (`is too long`) so the client localizes it with the strings and
 * per-field controls it already has.
 */

// Driver code -> the reason the client translates. Each one is proven by a test
// in test/estudiantes.e2e.test.js; an unproven code stays out, because a wrong
// reason is worse than the generic error.
const REASONS = new Map([
  ['ER_DATA_TOO_LONG', 'is too long'],
  ['ER_WARN_DATA_OUT_OF_RANGE', 'is out of range'],
  ['ER_TRUNCATED_WRONG_VALUE_FOR_FIELD', 'is invalid'],
])

// The driver names the column two ways. Unqualified:
//   "Data too long for column 'lateralidad' at row 1"
// and qualified, when the value's type itself is wrong, with backticks:
//   "Incorrect decimal value: 'gordo' for column `db`.`estudiantes`.`peso` at row 1"
// Take whatever follows "for column" and use its last segment.
const COLUMN = /for column\s+(.+?)(?:\s+at row\b.*)?$/i

/** @returns {string | null} the column name, without quoting or qualification. */
function columnOf(sqlMessage) {
  const match = COLUMN.exec(String(sqlMessage ?? ''))
  if (!match) return null
  const parts = match[1]
    .split('.')
    .map((part) => part.trim().replace(/^[`']|[`']$/g, ''))
  return parts[parts.length - 1] || null
}

/**
 * Read a value/column rejection out of a driver error.
 *
 * @param {unknown} err
 * @returns {{field: string, reason: string} | null} null when the error is not a
 *   value/column rejection, or when the column cannot be read from it. A wrong
 *   guess would send the user to a control that is not the problem, which is
 *   worse than the generic error, so the caller keeps its 500 for those.
 */
function columnRejection(err) {
  if (!err || typeof err !== 'object') return null
  const reason = REASONS.get(err.code)
  if (!reason) return null
  const field = columnOf(err.sqlMessage)
  if (!field) return null
  return { field, reason }
}

module.exports = { columnRejection }
