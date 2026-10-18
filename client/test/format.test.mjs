// Contact-format rules for the inscription wizard (S1, S2 of
// odd/tasks/higiene-datos.md). They live in their own module so the rule can be
// pinned without a DOM; the wizard's wiring to them is covered by
// inscripcion-format.test.mjs.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidEmail,
  isValidPhone,
  parseLatamDate,
  formatLatamDate,
  maskDateInput,
} from '../js/ui/format.js'

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

test('reads a date written the Latin American way, dd/mm/aaaa', () => {
  assert.equal(parseLatamDate('04/03/2010'), '2010-03-04')
  assert.equal(parseLatamDate('4/3/2010'), '2010-03-04', 'a single digit is still a day or a month')
  assert.equal(parseLatamDate(' 31/12/2026 '), '2026-12-31', 'surrounding blanks are ignored')
  assert.equal(parseLatamDate('01/01/1900'), '1900-01-01')
})

test('refuses a date that is not a real day of the calendar', () => {
  // A naive parse rolls each of these into the following month.
  assert.equal(parseLatamDate('31/02/2010'), null, 'February has no 31st')
  assert.equal(parseLatamDate('30/02/2024'), null)
  assert.equal(parseLatamDate('31/04/2026'), null, 'April has 30 days')
  assert.equal(parseLatamDate('00/01/2010'), null, 'there is no day zero')
  assert.equal(parseLatamDate('01/13/2010'), null, 'there is no month thirteen')
})

test('accepts 29 February only in a leap year', () => {
  assert.equal(parseLatamDate('29/02/2024'), '2024-02-29')
  assert.equal(parseLatamDate('29/02/2023'), null)
})

test('refuses anything else, including the US order it replaces', () => {
  // The point of the text field: the value cannot be silently read as the other
  // order the way a browser-locale picker let it.
  for (const value of ['', '   ', 'nope', '2010-03-04', '2010/03/04', '04/03/10', '2010', '04/03']) {
    assert.equal(parseLatamDate(value), null, `${JSON.stringify(value)} must be refused`)
  }
})

test('accepts a date written with any separator a person reaches for', () => {
  // Somebody pasting from a spreadsheet or a document should not have to
  // retype the date just to change its punctuation.
  assert.equal(parseLatamDate('04-03-2010'), '2010-03-04')
  assert.equal(parseLatamDate('4.3.2010'), '2010-03-04')
  assert.equal(parseLatamDate('04.03.2010'), '2010-03-04')
  // Eight digits is how the field reads on a phone keypad, which shows no slash.
  assert.equal(parseLatamDate('04032010'), '2010-03-04')
  assert.equal(parseLatamDate('12314010'), null, 'a keypad slip must still be caught')
})

test('writes the separator of a date as it is typed', () => {
  // Typing left to right: the slash appears where a person would have typed it.
  assert.equal(maskDateInput('0', '04'), '04/')
  assert.equal(maskDateInput('04/', '04/1'), '04/1')
  assert.equal(maskDateInput('04/1', '04/12'), '04/12/')
  assert.equal(maskDateInput('04/12/', '04/12/1999'), '04/12/1999', 'a finished date is left alone')
  // Nothing is invented out of a value that does not look like a date yet.
  assert.equal(maskDateInput('', 'abril'), 'abril')
  assert.equal(maskDateInput('', '0'), '0')
})

test('never re-fills what the user is deleting', () => {
  // The usual reason date masks infuriate people: you press backspace on the
  // slash and it comes straight back. Growth is what the mask reacts to.
  assert.equal(maskDateInput('04/', '04'), '04')
  assert.equal(maskDateInput('04/12/', '04/12'), '04/12')
  assert.equal(maskDateInput('04/12/1999', '04/12/199'), '04/12/199')
  assert.equal(maskDateInput('04', ''), '')
  // Pasting a whole date over an existing one shrinks or keeps the length, so
  // the typed value is preserved exactly and the parser deals with it.
  assert.equal(maskDateInput('04/03/2010', '04032010'), '04032010')
})

test('a date written without separators survives the round trip', () => {
  // The phone path: eight digits in, dd/mm/aaaa out, ISO to the API.
  assert.equal(formatLatamDate(parseLatamDate('04032010')), '04/03/2010')
})

test('writes a stored date the way a person reads it', () => {
  assert.equal(formatLatamDate('2010-03-04'), '04/03/2010')
  assert.equal(
    formatLatamDate('2010-03-04T04:30:00.000Z'),
    '04/03/2010',
    'the API answers datetimes: only the date part belongs in the field',
  )
  assert.equal(formatLatamDate(''), '')
  assert.equal(formatLatamDate(null), '')
  assert.equal(formatLatamDate(undefined), '')
  assert.equal(
    formatLatamDate('2010-3-4'),
    '04/03/2010',
    'a date the database holds is padded, never hidden',
  )
})

test('a written date survives the round trip to storage and back', () => {
  // parse → store (ISO) → display must land on the same day the user typed,
  // whatever timezone the machine is in.
  for (const written of ['04/03/2010', '31/12/2026', '01/01/1900', '29/02/2024', '11/07/1985']) {
    assert.equal(formatLatamDate(parseLatamDate(written)), written, `${written} must survive the round trip`)
  }
})
