'use strict'

const Model = require('tabla-model')

// Academic data for a student in a given school year. A student has at most one
// registration per school year: composite UNIQUE (estudiante_id, anio_escolar).
module.exports = new Model('inscripciones', {
  colums: [
    { name: 'id', type: 'int', primary: true, autoincrement: true },
    { name: 'estudiante_id', type: 'int', defaultNull: false, unique: true },
    { name: 'anio_escolar', type: 'varchar(9)', defaultNull: false, unique: true },
    { name: 'anio', type: 'varchar(10)', defaultNull: false },
    { name: 'seccion', type: 'varchar(2)', defaultNull: false, default: "'A'" },
    { name: 'regular', type: 'tinyint(1)', defaultNull: false, default: 1 },
    { name: 'repite', type: 'tinyint(1)', defaultNull: false, default: 0 },
    { name: 'docente_id', type: 'int' },
    { name: 'fecha_inscripcion', type: 'date', defaultNull: false },
    { name: 'edad_inscripcion', type: 'int' },
  ],
  foreingKey: [
    { key: 'estudiante_id', reference: 'estudiantes', keyReference: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    { key: 'docente_id', reference: 'usuarios', keyReference: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' },
  ],
})
