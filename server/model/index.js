'use strict'

// Registered models. Order here is irrelevant: mysql-tab resolves foreign-key
// dependencies recursively when creating tables.
module.exports = [
  require('./usuario.model'),
  require('./estudiante.model'),
  require('./representante.model'),
  require('./estudiante-representante.model'),
  require('./inscripcion.model'),
  require('./documento-consignado.model'),
  require('./documento-emitido.model'),
]
