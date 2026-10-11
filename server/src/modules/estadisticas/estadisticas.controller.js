'use strict'

const service = require('./estadisticas.service')
const { HttpError } = require('../../utils/httpError')
const { findYear, isValidSection } = require('../../constants/academic')

const SECTION_RE = /^[A-F]$/

/**
 * Normalize and validate the optional `anio`/`seccion` query filters. `anio`
 * must be a known year label; `seccion` a single letter A-F, cross-checked
 * against the year when one is given (a section is only valid for its year).
 * @param {{ anio?: unknown, seccion?: unknown }} query
 * @returns {{ anio?: string, seccion?: string }}
 * @throws {HttpError} 400 on any unknown value
 */
function parseFilters(query) {
  const rawAnio = query.anio
  const rawSeccion = query.seccion
  const details = {}

  let anio
  if (rawAnio !== undefined && rawAnio !== null && rawAnio !== '') {
    if (findYear(rawAnio)) {
      anio = rawAnio
    } else {
      details.anio = 'must be a known year label'
    }
  }

  let seccion
  if (rawSeccion !== undefined && rawSeccion !== null && rawSeccion !== '') {
    if (typeof rawSeccion !== 'string' || !SECTION_RE.test(rawSeccion)) {
      details.seccion = 'must be a single section letter A-F'
    } else if (anio !== undefined && !isValidSection(anio, rawSeccion)) {
      details.seccion = 'invalid section for the year'
    } else {
      seccion = rawSeccion
    }
  }

  if (Object.keys(details).length > 0) {
    throw HttpError.badRequest('Invalid estadisticas filters', details)
  }

  return { anio, seccion }
}

async function get(req, res, next) {
  try {
    const filters = parseFilters(req.query ?? {})
    const result = await service.getEstadisticas(filters)
    res.json(result)
  } catch (error) {
    next(error)
  }
}

module.exports = { get }