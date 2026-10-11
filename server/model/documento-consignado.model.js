'use strict'

const Model = require('tabla-model')

// One row per registration with the six required checkboxes.
module.exports = new Model('documentos_consignados', {
  colums: [
    { name: 'id', type: 'int', primary: true, autoincrement: true },
    { name: 'inscripcion_id', type: 'int', defaultNull: false, unique: true },
    { name: 'partida_nacimiento', type: 'tinyint(1)', defaultNull: false, default: 0 },
    { name: 'copia_cedula', type: 'tinyint(1)', defaultNull: false, default: 0 },
    { name: 'boleta', type: 'tinyint(1)', defaultNull: false, default: 0 },
    { name: 'fotos', type: 'tinyint(1)', defaultNull: false, default: 0 },
    { name: 'carpeta', type: 'tinyint(1)', defaultNull: false, default: 0 },
    { name: 'certificado_6to_grado', type: 'tinyint(1)', defaultNull: false, default: 0 },
  ],
  foreingKey: [
    { key: 'inscripcion_id', reference: 'inscripciones', keyReference: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
  ],
})
