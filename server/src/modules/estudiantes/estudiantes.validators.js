'use strict'

const { findYear, isValidSection } = require('../../constants/academic')

const CI_TYPES = ['V', 'E']
const SEXOS = ['M', 'F']
const NUMERO_CI_RE = /^\d{1,12}$/
const ANIO_ESCOLAR_RE = /^\d{4}-\d{4}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidTipoCi(value) {
  return CI_TYPES.includes(value)
}

function isValidNumeroCi(value) {
  return typeof value === 'string' && NUMERO_CI_RE.test(value)
}

function isValidSexo(value) {
  return SEXOS.includes(value)
}

/**
 * Accepts only real calendar dates in YYYY-MM-DD form. Rejects impossible
 * dates (2023-02-29), zero/overflow months and non-ISO separators.
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    return false
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function isValidAnioEscolar(value) {
  return typeof value === 'string' && ANIO_ESCOLAR_RE.test(value)
}

function isValidYearLabel(value) {
  return Boolean(findYear(value))
}

function isValidSeccion(yearLabel, section) {
  return isValidSection(yearLabel, section)
}

module.exports = {
  CI_TYPES,
  SEXOS,
  isNonEmptyString,
  isValidTipoCi,
  isValidNumeroCi,
  isValidSexo,
  isValidDate,
  isValidAnioEscolar,
  isValidYearLabel,
  isValidSeccion,
}