// Documentos view: smoke render.
//
// The screens of this app ship without a browser, so a broken render path used
// to stay invisible until somebody opened the page. This pins the initial
// paint: the cédula form exists, and no document button exists before a search
// (they act on a verified student, never on an empty screen).

import test from 'node:test'
import assert from 'node:assert/strict'
import { installDom, makeEl, findAll, textOf } from './dom-stub.mjs'

import { renderDocumentos } from '../js/views/documentos.js'

installDom()

test('the view paints the cédula form and the hidden print target', () => {
  const root = makeEl('div')

  renderDocumentos(root, { print: () => {} })

  assert.equal(findAll(root, '.documentos__cedula').length, 1, 'expected the cédula field')
  assert.equal(findAll(root, '.documentos__form').length, 1, 'expected the search form')
  assert.equal(findAll(root, '.documentos__print').length, 1, 'expected the print target')
  assert.equal(findAll(root, '.documentos__emit').length, 0, 'no document buttons before a search')
  assert.match(textOf(root), /Documentos/)
})
