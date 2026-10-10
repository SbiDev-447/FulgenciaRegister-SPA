'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { parseCedula, normalizeNumeroCi, cedulaWhere } = require('../src/utils/cedula')

test('parseCedula accepts human-formatted cédulas', () => {
  assert.deepEqual(parseCedula('V-12345678'), { tipo_ci: 'V', numero_ci: '12345678' })
  assert.deepEqual(parseCedula('v-12.345.678'), { tipo_ci: 'V', numero_ci: '12345678' })
  assert.deepEqual(parseCedula('V 12 345 678'), { tipo_ci: 'V', numero_ci: '12345678' })
  assert.deepEqual(parseCedula('  E-1.234  '), { tipo_ci: 'E', numero_ci: '1234' })
  assert.deepEqual(parseCedula('V123'), { tipo_ci: 'V', numero_ci: '123' })
  // Leading zeros are preserved, never stripped.
  assert.deepEqual(parseCedula('V-00.012'), { tipo_ci: 'V', numero_ci: '00012' })
})

test('parseCedula rejects malformed input', () => {
  const bad = ['X-12', 'V-', 'V', '', 'V-12X', 'V-1-2', 'EE-12', 1234, null, undefined, 'V-1234567890123']
  for (const value of bad) {
    assert.equal(parseCedula(value), null, `expected null for ${JSON.stringify(value)}`)
  }
})

test('normalizeNumeroCi strips spaces and dots, keeps digits', () => {
  assert.equal(normalizeNumeroCi('12.345.678'), '12345678')
  assert.equal(normalizeNumeroCi(' 12 345 678 '), '12345678')
  assert.equal(normalizeNumeroCi('00012'), '00012')
  // A JSON number passes through unchanged (it is not a string, and it cannot
  // carry leading zeros anyway).
  assert.equal(normalizeNumeroCi(12345678), 12345678)
})

test('cedulaWhere forces a string (LIKE) comparison', () => {
  assert.deepEqual(cedulaWhere('V', '12'), { tipo_ci: 'V', 'numero_ci%': '12' })
})
