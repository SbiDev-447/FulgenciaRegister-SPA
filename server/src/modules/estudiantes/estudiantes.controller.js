'use strict'

const service = require('./estudiantes.service')
const validators = require('./estudiantes.validators')
const { HttpError } = require('../../utils/httpError')
const { normalizeNumeroCi } = require('../../utils/cedula')

function assertValidStudent(student, { partial = false } = {}) {
  // Canonicalize human-formatted input (`12.345.678`, spaces) before validating
  // and before it is stored. Mutating the shared object propagates to the service.
  if (student.numero_ci !== undefined) {
    student.numero_ci = normalizeNumeroCi(student.numero_ci)
  }
  const details = {}
  const check = (key, valid, message) => {
    if (!partial || student[key] !== undefined) {
      if (!valid(student[key])) {
        details[key] = message
      }
    }
  }
  check('tipo_ci', validators.isValidTipoCi, 'must be V or E')
  check('numero_ci', validators.isValidNumeroCi, 'must be 1-12 digits')
  check('primer_nombre', validators.isNonEmptyString, 'is required')
  check('primer_apellido', validators.isNonEmptyString, 'is required')
  check('fecha_nacimiento', validators.isValidDate, 'must be a valid YYYY-MM-DD date')
  check('sexo', validators.isValidSexo, 'must be M or F')

  if (Object.keys(details).length > 0) {
    throw HttpError.badRequest('Invalid estudiante data', details)
  }
}

function assertValidInscripcion(inscripcion, { partial = false } = {}) {
  const details = {}
  const required = (key, valid, message) => {
    if (!partial || inscripcion[key] !== undefined) {
      if (!valid(inscripcion[key])) {
        details[key] = message
      }
    }
  }
  const optional = (key, valid, message) => {
    if (inscripcion[key] !== undefined && !valid(inscripcion[key])) {
      details[key] = message
    }
  }

  required('anio', validators.isValidYearLabel, 'must be a known year label')
  required('anio_escolar', validators.isValidAnioEscolar, 'must match YYYY-YYYY')
  required('fecha_inscripcion', validators.isValidDate, 'must be a valid YYYY-MM-DD date')
  optional('regular', (value) => typeof value === 'boolean', 'must be a boolean')
  optional('repite', (value) => typeof value === 'boolean', 'must be a boolean')
  optional('docente_id', (value) => Number.isInteger(value) && value > 0, 'must be a positive integer')

  // Section is only cross-checked when the year to validate against is known
  // here; on partial updates without `anio` the service checks against the
  // stored inscription year.
  if (inscripcion.seccion !== undefined && inscripcion.anio !== undefined) {
    if (!validators.isValidSeccion(inscripcion.anio, inscripcion.seccion)) {
      details.seccion = 'invalid section for the year'
    }
  }
  if (!partial && inscripcion.seccion === undefined) {
    details.seccion = 'is required'
  }

  if (Object.keys(details).length > 0) {
    throw HttpError.badRequest('Invalid inscripcion data', details)
  }
}

function assertValidRepresentantes(representantes, { allowEmpty = false } = {}) {
  if (!Array.isArray(representantes) || (representantes.length === 0 && !allowEmpty)) {
    throw HttpError.badRequest('representantes must be a non-empty array')
  }

  const seen = new Set()
  representantes.forEach((item, index) => {
    if (item.numero_ci !== undefined) {
      item.numero_ci = normalizeNumeroCi(item.numero_ci)
    }
    const details = {}
    if (!validators.isNonEmptyString(item.nombre)) {
      details.nombre = 'is required'
    }
    if (!validators.isValidTipoCi(item.tipo_ci)) {
      details.tipo_ci = 'must be V or E'
    }
    if (!validators.isValidNumeroCi(item.numero_ci)) {
      details.numero_ci = 'must be 1-12 digits'
    }
    if (Object.keys(details).length > 0) {
      throw HttpError.badRequest(`Invalid representative at index ${index}`, details)
    }
    const ciKey = `${item.tipo_ci}-${item.numero_ci}`
    if (seen.has(ciKey)) {
      throw HttpError.badRequest('Invalid representative at index', { index, duplicate_ci: ciKey })
    }
    seen.add(ciKey)
  })
}

function assertValidDocumentos(documentos) {
  for (const key of [
    'partida_nacimiento',
    'copia_cedula',
    'boleta',
    'fotos',
    'carpeta',
    'certificado_6to_grado',
  ]) {
    if (documentos[key] !== undefined && typeof documentos[key] !== 'boolean') {
      throw HttpError.badRequest('Invalid documentos data', { [key]: 'must be a boolean' })
    }
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseId(raw) {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw HttpError.badRequest('id must be a positive integer')
  }
  return id
}

async function list(req, res, next) {
  try {
    const { q, anio, seccion } = req.query ?? {}
    const result = await service.listEstudiantes({ q, anio, seccion })
    res.json(result)
  } catch (error) {
    next(error)
  }
}

async function getById(req, res, next) {
  try {
    const id = parseId(req.params.id)
    const record = await service.getFullRecord(id)
    if (!record) {
      throw HttpError.notFound('Estudiante not found')
    }
    res.json(record)
  } catch (error) {
    next(error)
  }
}

async function create(req, res, next) {
  try {
    const body = req.body ?? {}
    if (!isObject(body.estudiante)) {
      throw HttpError.badRequest('estudiante is required and must be an object')
    }
    if (!isObject(body.inscripcion)) {
      throw HttpError.badRequest('inscripcion is required and must be an object')
    }

    assertValidStudent(body.estudiante)
    assertValidInscripcion(body.inscripcion)
    assertValidRepresentantes(body.representantes)
    assertValidDocumentos(body.documentos ?? {})

    const record = await service.createEstudiante(body)
    res.status(201).json(record)
  } catch (error) {
    next(error)
  }
}

async function update(req, res, next) {
  try {
    const id = parseId(req.params.id)
    const body = req.body ?? {}

    const patch = {}
    if (body.estudiante !== undefined) {
      if (!isObject(body.estudiante)) {
        throw HttpError.badRequest('estudiante must be an object')
      }
      assertValidStudent(body.estudiante, { partial: true })
      patch.estudiante = body.estudiante
    }
    if (body.inscripcion !== undefined) {
      if (!isObject(body.inscripcion) || body.inscripcion.anio_escolar === undefined) {
        throw HttpError.badRequest(
          'inscripcion must be an object with anio_escolar identifying the inscription to update',
        )
      }
      assertValidInscripcion(body.inscripcion, { partial: true })
      patch.inscripcion = body.inscripcion
    }
    if (body.representantes !== undefined) {
      // PUT may empty the list to remove every link; POST requires at least one.
      assertValidRepresentantes(body.representantes, { allowEmpty: true })
      patch.representantes = body.representantes
    }
    if (body.documentos !== undefined) {
      if (!isObject(body.documentos)) {
        throw HttpError.badRequest('documentos must be an object')
      }
      assertValidDocumentos(body.documentos)
      patch.documentos = body.documentos
    }

    const record = await service.updateEstudiante(id, patch)
    if (!record) {
      throw HttpError.notFound('Estudiante not found')
    }
    res.json(record)
  } catch (error) {
    next(error)
  }
}

async function remove(req, res, next) {
  try {
    const id = parseId(req.params.id)
    const deleted = await service.deleteEstudiante(id)
    if (!deleted) {
      throw HttpError.notFound('Estudiante not found')
    }
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
}

module.exports = { list, getById, create, update, remove }