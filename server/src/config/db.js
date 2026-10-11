'use strict'

const MySQL = require('mysql-tab')
const { db: config } = require('./env')
const models = require('../../model')

// mysql-tab is the repository layer for the whole backend: instead of wrapping it
// in another abstraction, modules use `db.tabla('<name>')` directly.
const db = new MySQL(config)

for (const model of models) {
  db.addModel(model)
}

module.exports = db
