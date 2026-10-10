'use strict'

const service = require('./documentos.service')
const { HttpError } = require('../../utils/httpError')
const { TIPOS_SLUGS, findTipo } = require('../../constants/documentos')

async function verificar(req, res, next) {
  try {
    const result = await service.verificar(req.params.cedula)
    res.json(result)
  } catch (error) {
    next(error)
  }
}

async function emitir(req, res, next) {
  try {
    const body = req.body ?? {}
    const details = {}

    const tipo = body.tipo
    if (!findTipo(tipo)) {
      details.tipo = `must be one of: ${TIPOS_SLUGS.join(', ')}`
    }

    const estudianteId = body.estudiante_id
    if (typeof estudianteId !== 'number' || !Number.isInteger(estudianteId) || estudianteId <= 0) {
      details.estudiante_id = 'must be a positive integer'
    }

    if (Object.keys(details).length > 0) {
      throw HttpError.badRequest('Invalid documento data', details)
    }

    const result = await service.emitir({
      tipo,
      estudiante_id: estudianteId,
      usuario_id: req.user.id,
    })
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
}

module.exports = { verificar, emitir }
