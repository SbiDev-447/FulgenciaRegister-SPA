// Contact-format rules for the inscription wizard (S1, S2 of
// odd/tasks/higiene-datos.md). They live in their own module so the rule can be
// pinned without a DOM; the wizard's wiring to them is covered by
// inscripcion-format.test.mjs.

import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidEmail, isValidPhone } from '../js/ui/format.js'

test('accepts the email shapes a school actually receives', () => {
  const valid = ['correo@ejemplo.com', 'ana.perez+inscripcion@colegio.edu.ve', 'A@b.co']
  for (const value of valid) {
    assert.equal(isValidEmail(value), true, `${value} must be accepted`)
  }
})

test('rejects emails without the algo@algo.algo shape', () => {
  const invalid = ['sin-arroba', 'a@b', '@ejemplo.com', 'correo@', 'con espacio@ejemplo.com', 'a@@b.com', '']
  for (const value of invalid) {
    assert.equal(isValidEmail(value), false, `${value} must be rejected`)
  }
})

test('accepts the phone shapes used in Venezuela', () => {
  const valid = ['0414-1234567', '+58 414 1234567', '(0212) 555.1234', '04141234567']
  for (const value of valid) {
    assert.equal(isValidPhone(value), true, `${value} must be accepted`)
  }
})

test('rejects phones with letters or an impossible digit count', () => {
  const invalid = ['hola', '0414-ABCDEF', '123456', '1234567890123456', '', '   ']
  for (const value of invalid) {
    assert.equal(isValidPhone(value), false, `${value} must be rejected`)
  }
})

test('ignores the separators when counting phone digits', () => {
  // Same number written three ways: the rule must not depend on the dashes.
  assert.equal(isValidPhone('0414-1234567'), true)
  assert.equal(isValidPhone('0414 1234567'), true)
  assert.equal(isValidPhone('(0414) 1234567'), true)
})
