'use strict'

// The gate in front of the settings writes and the two maintenance operations.
//
// It is asserted here, without HTTP, because what matters is the rule itself:
// the seeded admin passes, any other role is refused with 403, and a request
// that reached it without a user is still a 401 rather than a crash.

const test = require('node:test')
const assert = require('node:assert/strict')

// `roles.js` deliberately does not pull the database in, so this suite runs
// without an `.env` or a container — which is also why `pnpm test` can run it.
const { requireAdmin } = require('../src/middlewares/roles')

function run(user) {
  let outcome
  requireAdmin({ user }, {}, (error) => {
    outcome = error ?? null
  })
  return outcome
}

test('requireAdmin lets the admin role through', () => {
  assert.equal(run({ id: 1, rol: 'admin' }), null)
})

test('requireAdmin refuses any other role with 403', () => {
  const error = run({ id: 2, rol: 'docente' })

  assert.ok(error, 'a non-admin was allowed')
  assert.equal(error.status, 403)
  assert.equal(error.code, 'forbidden')
})

test('requireAdmin treats a missing user as unauthenticated', () => {
  const error = run(undefined)

  assert.equal(error.status, 401)
  assert.equal(error.code, 'unauthorized')
})
