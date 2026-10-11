'use strict'

const Model = require('tabla-model')

// N:M bridge between students and representatives. Composite primary key.
module.exports = new Model('estudiante_representante', {
  colums: [
    { name: 'estudiante_id', type: 'int', primary: true },
    { name: 'representante_id', type: 'int', primary: true },
    { name: 'parentesco', type: 'varchar(30)' },
  ],
  foreingKey: [
    { key: 'estudiante_id', reference: 'estudiantes', keyReference: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    { key: 'representante_id', reference: 'representantes', keyReference: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
  ],
})
