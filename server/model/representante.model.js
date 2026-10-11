'use strict'

const Model = require('tabla-model')

// A representative can be shared by several students (siblings). Identity is the
// pair (tipo_ci, numero_ci). The relation with students lives in the bridge table.
module.exports = new Model('representantes', {
  colums: [
    { name: 'id', type: 'int', primary: true, autoincrement: true },
    { name: 'tipo_ci', type: 'varchar(1)', defaultNull: false, unique: true },
    { name: 'numero_ci', type: 'varchar(12)', defaultNull: false, unique: true },
    { name: 'nombre', type: 'varchar(120)', defaultNull: false },
    { name: 'fecha_nacimiento', type: 'date' },
    { name: 'telefono', type: 'varchar(20)' },
    { name: 'correo', type: 'varchar(120)' },
    { name: 'estado_civil', type: 'varchar(30)' },
    { name: 'direccion_habitacion', type: 'text' },
  ],
})
