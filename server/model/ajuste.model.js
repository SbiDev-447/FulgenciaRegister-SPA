'use strict'

const Model = require('tabla-model')

// Institutional settings that are not per student and not history: the sitting
// director and the ministry logo printed on every document. One row per value,
// keyed by name, because these are unrelated facts and a third one will show up
// eventually.
//
// The value is JSON in a LONGTEXT: `dbtabla` interpolates values as text, so a
// binary column could not travel through it. The logo is stored as base64 for
// the same reason.
module.exports = new Model('ajustes', {
  colums: [
    { name: 'clave', type: 'varchar(40)', primary: true },
    { name: 'valor', type: 'longtext', defaultNull: false },
    { name: 'actualizado_en', type: 'datetime', defaultNull: false, default: 'CURRENT_TIMESTAMP' },
  ],
})
