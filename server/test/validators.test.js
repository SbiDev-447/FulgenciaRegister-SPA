'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  isNonEmptyString,
  isValidTipoCi,
  isValidNumeroCi,
  isValidSexo,
  isValidDate,
  isValidAnioEscolar,
  isValidYearLabel,
  isValidSeccion,
} = require('../src/modules/estudiantes/estudiantes.validators')

test('validates the cédula type', () => {
  assert.equal(isValidTipoCi('V'), true)
  assert.equal(isValidTipoCi('E'), true)
  assert.equal(isValidTipoCi('J'), false)
  assert.equal(isValidTipoCi('v'), false)
  assert.equal(isValidTipoCi(''), false)
  assert.equal(isValidTipoCi(null), false)
})

test('validates the cédula number format (1-12 digits)', () => {
  assert.equal(isValidNumeroCi('0'), true)
  assert.equal(isValidNumeroCi('12345678'), true)
  assert.equal(isValidNumeroCi('123456789012'), true)
  assert.equal(isValidNumeroCi('1234567890123'), false)
  assert.equal(isValidNumeroCi('12a'), false)
  assert.equal(isValidNumeroCi(''), false)
  assert.equal(isValidNumeroCi(12345), false)
  assert.equal(isValidNumeroCi(null), false)
})

test('validates the sexo field', () => {
  assert.equal(isValidSexo('M'), true)
  assert.equal(isValidSexo('F'), true)
  assert.equal(isValidSexo('X'), false)
  assert.equal(isValidSexo('m'), false)
})

test('validates real YYYY-MM-DD dates', () => {
  assert.equal(isValidDate('2024-02-29'), true)
  assert.equal(isValidDate('2023-02-29'), false)
  assert.equal(isValidDate('2024-13-01'), false)
  assert.equal(isValidDate('2024-00-10'), false)
  assert.equal(isValidDate('2024-04-31'), false)
  assert.equal(isValidDate('2024-1-1'), false)
  assert.equal(isValidDate('2024/01/01'), false)
  assert.equal(isValidDate('not-a-date'), false)
  assert.equal(isValidDate(''), false)
  assert.equal(isValidDate(null), false)
})

test('validates the anio_escolar format (YYYY-YYYY)', () => {
  assert.equal(isValidAnioEscolar('2025-2026'), true)
  assert.equal(isValidAnioEscolar('2025-26'), false)
  assert.equal(isValidAnioEscolar('20252026'), false)
  assert.equal(isValidAnioEscolar('2025-2026-2027'), false)
})

test('validates year labels against the academic calendar', () => {
  assert.equal(isValidYearLabel('1er Año'), true)
  assert.equal(isValidYearLabel('5to Año'), true)
  assert.equal(isValidYearLabel('6to Año'), false)
  assert.equal(isValidYearLabel(''), false)
  assert.equal(isValidYearLabel(null), false)
})

test('validates the section against its year', () => {
  assert.equal(isValidSeccion('1er Año', 'A'), true)
  assert.equal(isValidSeccion('1er Año', 'F'), true)
  assert.equal(isValidSeccion('3er Año', 'E'), true)
  assert.equal(isValidSeccion('3er Año', 'F'), false)
  assert.equal(isValidSeccion('5to Año', 'E'), false)
  assert.equal(isValidSeccion('6to Año', 'A'), false)
  assert.equal(isValidSeccion('1er Año', null), false)
})

test('detects non-empty trimmed strings', () => {
  assert.equal(isNonEmptyString('  John  '), true)
  assert.equal(isNonEmptyString('   '), false)
  assert.equal(isNonEmptyString(''), false)
  assert.equal(isNonEmptyString(42), false)
  assert.equal(isNonEmptyString(undefined), false)
})