// Institutional data printed on the letterhead of every document. Pinned here
// so a renamed asset or a cargo outside the two allowed ones is caught now and
// not on a printed constancia.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { POSITIONS, INSTITUTION } from '../js/institution.js'

test('the letterhead names the school and points at a logo that exists', () => {
  assert.match(INSTITUTION.school, /Liceo Fulgencia/)
  const logo = new URL(`../${INSTITUTION.logo}`, import.meta.url)
  assert.ok(fs.existsSync(logo), `${INSTITUTION.logo} must exist on disk`)
})

test('the director carries a name, a V- cédula and one of the two cargos', () => {
  const { name, ci, position } = INSTITUTION.director
  assert.ok(name.trim().length > 0, 'the director needs a name')
  assert.match(ci, /^V-\d/, 'a Venezuelan cédula starts with V-')
  assert.ok(POSITIONS.includes(position), `${position} must be one of ${POSITIONS.join(' / ')}`)
})
