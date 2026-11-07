'use strict'

const service = require('./reportes.service')
const { HttpError } = require('../../utils/httpError')
const { findYear, isValidSection } = require('../../constants/academic')

const SECTION_RE = /^[A-F]$/
const ANIO_ESCOLAR_RE = /^\d{4}-\d{4}$/

/**
 * A section report always names a grade and a section: a section letter alone
 * repeats across every year, so it would not identify a group of students.
 * `anio_escolar` is optional and pins an older school year.
 * @param {{ anio?: unknown, seccion?: unknown, anio_escolar?: unknown }} query
 * @returns {{ anio: string, seccion: string, anio_escolar?: string }}
 * @throws {HttpError} 400 on any unknown value
 */
function parseFilters(query) {
  const details = {}

  let anio
  if (typeof query.anio !== 'string' || !findYear(query.anio)) {
    details.anio = 'must be a known year label'
  } else {
    anio = query.anio
  }

  let seccion
  if (typeof query.seccion !== 'string' || !SECTION_RE.test(query.seccion)) {
    details.seccion = 'must be a single section letter A-F'
  } else if (anio !== undefined && !isValidSection(anio, query.seccion)) {
    details.seccion = 'invalid section for the year'
  } else {
    seccion = query.seccion
  }

  let anio_escolar
  if (
    query.anio_escolar !== undefined &&
    query.anio_escolar !== null &&
    query.anio_escolar !== ''
  ) {
    if (typeof query.anio_escolar !== 'string' || !ANIO_ESCOLAR_RE.test(query.anio_escolar)) {
      details.anio_escolar = 'must match YYYY-YYYY'
    } else {
      anio_escolar = query.anio_escolar
    }
  }

  if (Object.keys(details).length > 0) {
    throw HttpError.badRequest('Invalid reporte filters', details)
  }

  return { anio, seccion, anio_escolar }
}

async function getSection(req, res, next) {
  try {
    const filters = parseFilters(req.query ?? {})
    const result = await service.getSectionRoster(filters)
    res.json(result)
  } catch (error) {
    next(error)
  }
}

module.exports = { getSection, parseFilters }
