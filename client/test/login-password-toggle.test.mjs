// The password field starts masked and must be revealable without submitting
// the form. These tests drive the real login view and read what a person would
// get: the input's own `type`, and the button's accessible name.

import test from 'node:test'
import assert from 'node:assert/strict'
import { installDom, makeEl, findAll, dispatch } from './dom-stub.mjs'

installDom()

test('the password field starts masked, with a reveal button that never submits', async () => {
  const { renderLogin } = await import('../js/views/login.js')

  const container = makeEl('div')
  renderLogin(container)

  const input = findAll(container, 'input[name="password"]')[0]
  const toggle = findAll(container, '.field__toggle')[0]

  assert.ok(input, 'expected a password input')
  assert.ok(toggle, 'expected a reveal button next to the password')
  assert.equal(input.getAttribute('type'), 'password', 'the password started readable')
  assert.equal(toggle.getAttribute('type'), 'button', 'the reveal button would submit the form')
  assert.equal(toggle.getAttribute('aria-label'), 'Mostrar contraseña')
})

test('the reveal button flips the field between password and text', async () => {
  const { renderLogin } = await import('../js/views/login.js')

  const container = makeEl('div')
  renderLogin(container)

  const input = findAll(container, 'input[name="password"]')[0]
  const toggle = findAll(container, '.field__toggle')[0]

  await dispatch(toggle, 'click')
  assert.equal(input.getAttribute('type'), 'text', 'the password did not become readable')
  assert.equal(toggle.getAttribute('aria-label'), 'Ocultar contraseña')

  await dispatch(toggle, 'click')
  assert.equal(input.getAttribute('type'), 'password', 'the password did not go back to masked')
  assert.equal(toggle.getAttribute('aria-label'), 'Mostrar contraseña')
})

test('the reveal button swaps its eye icon and keeps exactly one icon', async () => {
  const { renderLogin } = await import('../js/views/login.js')

  const container = makeEl('div')
  renderLogin(container)

  const toggle = findAll(container, '.field__toggle')[0]
  const iconsBefore = toggle.children.length

  await dispatch(toggle, 'click')

  const iconsAfter = toggle.children.length
  assert.equal(iconsBefore, 1, 'expected a single icon before revealing')
  assert.equal(iconsAfter, 1, 'the icon was appended instead of replaced')
})

test('toggling keeps what the person already typed', async () => {
  const { renderLogin } = await import('../js/views/login.js')

  const container = makeEl('div')
  renderLogin(container)

  const form = findAll(container, 'form')[0]
  const toggle = findAll(container, '.field__toggle')[0]

  form.elements.password.value = 'secreto'

  await dispatch(toggle, 'click')

  assert.equal(form.elements.password.value, 'secreto', 'revealing wiped the password')
})
