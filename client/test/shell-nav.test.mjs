// Sidebar navigation.
//
// "Nueva inscripción" is a first-class entry, placed right below Estudiantes
// because that is the list the enrolment flow starts from: the operator scans
// the roster first, then adds somebody to it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { installDom, makeEl, findAll, textOf } from './dom-stub.mjs'

import { mountShell } from '../js/shell.js'

installDom()

test('the sidebar lists Nueva inscripción right below Estudiantes', () => {
  const root = makeEl('div')

  mountShell(root, { user: { nombre: 'Ana', rol: 'admin' }, onLogout: () => {} })

  const labels = findAll(root, '.nav-link').map((link) => textOf(link).trim())

  assert.deepEqual(labels, ['Inicio', 'Estudiantes', 'Nueva inscripción', 'Documentos'])
})
