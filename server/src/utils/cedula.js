'use strict'

/**
 * Build the WHERE clause for an exact cédula match.
 *
 * mysql-tab quotes a value only when it is a string starting with `0` followed
 * by a digit; a plain digit string like `'12'` is emitted unquoted and MySQL
 * coerces the column to a number, so `numero_ci = 12` matches both `'12'` and
 * `'00012'`. Suffixing the field with `%` switches the operator to `LIKE`,
 * which compares as a string and matches the stored value literally.
 *
 * `numero_ci` is validated as 1-12 digits upstream, so it never contains `%`
 * or `_` wildcards and the LIKE is an exact match.
 *
 * @param {string} tipo_ci - `V` or `E`
 * @param {string} numero_ci - 1-12 digits
 * @returns {Record<string, string>}
 */
function cedulaWhere(tipo_ci, numero_ci) {
  return { tipo_ci, 'numero_ci%': numero_ci }
}

module.exports = { cedulaWhere }
