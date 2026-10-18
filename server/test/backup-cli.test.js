'use strict'

// The commands themselves, run the way a person runs them. The checks above
// cover the decisions; these cover the two behaviours that only appear when the
// script is the process: what it tells you before a restore, and what it says
// when the database is not there.
//
// Docker makes them optional on purpose, like the e2e suite: a machine without
// a running container still gets a full test run.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { BACKUPS, ROOT } = require('../db/backup')

const SERVER = path.join(ROOT, 'server')

function dockerAvailable() {
  try {
    return spawnSync('docker', ['--version'], { encoding: 'utf8' }).status === 0
  } catch {
    return false
  }
}

function containerRunning() {
  const result = spawnSync('docker', ['compose', 'exec', '-T', 'db', 'true'], { cwd: ROOT, encoding: 'utf8' })
  return result.status === 0
}

function hasBackup() {
  return fs.existsSync(BACKUPS) && fs.readdirSync(BACKUPS).some((name) => name.endsWith('.sql'))
}

const docker = dockerAvailable()
const running = docker && containerRunning()

test('db:restore without --apply explains the stakes and writes nothing', { skip: !running || !hasBackup() }, () => {
  const result = spawnSync('node', ['db/restore.js'], { cwd: SERVER, encoding: 'utf8' })

  assert.equal(result.status, 0)
  assert.match(result.stdout, /Nothing was written/)
  // It must hand the person the way to keep what is there right now, not just
  // warn about losing it.
  assert.match(result.stdout, /pnpm db:dump/)
  assert.match(result.stdout, /--apply/)
})

test('db:dump and db:restore explain themselves when the container is down', { skip: !docker || running }, () => {
  const dump = spawnSync('node', ['db/dump.js'], { cwd: SERVER, encoding: 'utf8' })
  assert.equal(dump.status, 1)
  assert.match(dump.stderr, /pnpm db:up/)

  const restore = spawnSync('node', ['db/restore.js'], { cwd: SERVER, encoding: 'utf8' })
  assert.equal(restore.status, 1)
  assert.match(restore.stderr, /pnpm db:up/)
})
