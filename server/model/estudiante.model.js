'use strict'

const Model = require('tabla-model')

// Personal data + physical record for a student. The logical identity is the
// pair (tipo_ci, numero_ci), enforced with a composite UNIQUE constraint.
module.exports = new Model('estudiantes', {
  colums: [
    { name: 'id', type: 'int', primary: true, autoincrement: true },
    { name: 'tipo_ci', type: 'varchar(1)', defaultNull: false, unique: true },
    { name: 'numero_ci', type: 'varchar(12)', defaultNull: false, unique: true },
    { name: 'primer_nombre', type: 'varchar(60)', defaultNull: false },
    { name: 'segundo_nombre', type: 'varchar(60)' },
    { name: 'primer_apellido', type: 'varchar(60)', defaultNull: false },
    { name: 'segundo_apellido', type: 'varchar(60)' },
    { name: 'fecha_nacimiento', type: 'date', defaultNull: false },
    { name: 'sexo', type: 'varchar(1)', defaultNull: false },
    { name: 'pais_nacimiento', type: 'varchar(60)', default: "'Venezuela'" },
    { name: 'estado_nacimiento', type: 'varchar(60)', default: "'Trujillo'" },
    { name: 'municipio_nacimiento', type: 'varchar(60)', default: "'Miranda'" },
    { name: 'correo', type: 'varchar(120)' },
    { name: 'telefono', type: 'varchar(20)' },
    { name: 'lateralidad', type: 'varchar(20)' },
    { name: 'talla', type: 'varchar(10)' },
    { name: 'peso', type: 'decimal(5,2)' },
    { name: 'camisa', type: 'varchar(10)' },
    { name: 'pantalon', type: 'varchar(10)' },
    { name: 'zapatos', type: 'varchar(10)' },
    { name: 'direccion_habitacion', type: 'text' },
    { name: 'alergico_a', type: 'text' },
    { name: 'enfermedades_padecidas', type: 'text' },
  ],
})
