'use strict'

const Model = require('tabla-model')

module.exports = new Model('usuarios', {
  colums: [
    { name: 'id', type: 'int', primary: true, autoincrement: true },
    { name: 'usuario', type: 'varchar(50)', defaultNull: false, unique: true },
    { name: 'password_hash', type: 'varchar(255)', defaultNull: false },
    { name: 'salt', type: 'varchar(64)', defaultNull: false },
    { name: 'nombre', type: 'varchar(120)', defaultNull: false },
    { name: 'rol', type: 'varchar(20)', defaultNull: false, default: "'docente'" },
    { name: 'creado_en', type: 'datetime', defaultNull: false, default: 'CURRENT_TIMESTAMP' },
  ],
})
