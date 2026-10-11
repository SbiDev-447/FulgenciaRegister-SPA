'use strict'

// Venezuelan cédula: V/E prefix, optional dash, 1-12 digits. Matched after the
// input has been trimmed, upper-cased and stripped of human formatting.
const CEDULA_RE = /^([VE])-?(\d{1,12})$/

/**
 * Remove the formatting a person may type by hand: spaces and thousands
 * separators (dots). `\s` already covers the non-breaking space some mobile
 * keyboards emit. Non-string values pass through unchanged.
 * @param {unknown} value
 * @returns {unknown}
 */
function stripCedulaFormatting(value) {
  return typeof value === 'string' ? value.replace(/[\s.]/g, '') : value
}

/**
 * Canonicalize the numeric part of a cédula to its digits-only form, so
 * `12.345.678` and `12 345 678` are stored as `12345678`. Leading zeros are
 * preserved (they are part of the stored value, not noise). Numbers are left
 * untouched because a JSON number cannot carry leading zeros.
 * @param {unknown} value
 * @returns {unknown}
 */
function normalizeNumeroCi(value) {
  return stripCedulaFormatting(value)
}

/**
 * Parse a free-text cédula into its canonical `{ tipo_ci, numero_ci }` pair.
 * Accepts optional spaces, dots and a single dash after the prefix, and is
 * case-insensitive: `v-12.345.678`, `V 12345678` and `V-12345678` are equal.
 * @param {unknown} raw
 * @returns {{ tipo_ci: string, numero_ci: string }|null} null when malformed
 */
function parseCedula(raw) {
  if (typeof raw !== 'string') {
    return null
  }
  const cleaned = stripCedulaFormatting(raw.trim().toUpperCase())
  const match = CEDULA_RE.exec(cleaned)
  if (!match) {
    return null
  }
  return { tipo_ci: match[1], numero_ci: match[2] }
}

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

module.exports = { CEDULA_RE, stripCedulaFormatting, normalizeNumeroCi, parseCedula, cedulaWhere }
