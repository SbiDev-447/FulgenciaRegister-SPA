'use strict'

const Model = require('tabla-model')

// Audit log of generated PDFs. Feeds the "emitted documents this year" card.
module.exports = new Model('documentos_emitidos', {
  colums: [
    { name: 'id', type: 'int', primary: true, autoincrement: true },
    { name: 'estudiante_id', type: 'int', defaultNull: false },
    { name: 'tipo', type: 'varchar(30)', defaultNull: false },
    { name: 'usuario_id', type: 'int' },
    { name: 'fecha_emision', type: 'datetime', defaultNull: false, default: 'CURRENT_TIMESTAMP' },
  ],
  foreingKey: [
    { key: 'estudiante_id', reference: 'estudiantes', keyReference: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    { key: 'usuario_id', reference: 'usuarios', keyReference: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' },
  ],
})
