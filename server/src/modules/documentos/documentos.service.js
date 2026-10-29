'use strict'

const db = require('../../config/db')
const { HttpError } = require('../../utils/httpError')
const { parseCedula, cedulaWhere } = require('../../utils/cedula')

/**
 * Representative summary for the printed letter, or null when the student has
 * none. Business rule: one representative per student. The bridge table still
 * allows several, so the lowest representante_id wins deterministically.
 * @param {number} studentId
 * @returns {Promise<object|null>}
 */
async function buildRepresentante(studentId) {
  const links = await db
    .tabla('estudiante_representante')
    .select({ where: { estudiante_id: studentId }, order: 'representante_id ASC' })
  const link = links[0]
  if (!link) {
    return null
  }

  const rep = await db
    .tabla('representantes')
    .selectById(link.representante_id)
  if (!rep) {
    return null
  }

  return {
    tipo_ci: rep.tipo_ci,
    numero_ci: rep.numero_ci,
    nombre_completo: rep.nombre,
    parentesco: link.parentesco ?? null,
  }
}

/**
 * Format a DB date as a plain calendar date (`YYYY-MM-DD`), the shape the
 * client formats for display. The driver hands back a Date built from local
 * midnight, so a naive toISOString() would shift the day.
 * @param {Date|string|null|undefined} value
 * @returns {string|null}
 */
function toDateOnly(value) {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'string') {
    return value.slice(0, 10)
  }
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${value.getFullYear()}-${month}-${day}`
}

/**
 * Printable student summary shared by verify and emit: identity, full name
 * (surnames first, as printed on the letters) and the data of the most recent
 * inscription (MAX anio_escolar). Students without inscriptions report null
 * academic fields.
 * @param {object} student
 * @returns {Promise<object>}
 */
async function buildStudentSummary(student) {
  const inscriptions = await db
    .tabla('inscripciones')
    .select({ where: { estudiante_id: student.id }, order: 'anio_escolar DESC' })
  const latest = inscriptions[0] ?? null
  const nombreCompleto = [
    student.primer_apellido,
    student.segundo_apellido,
    student.primer_nombre,
    student.segundo_nombre,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    id: student.id,
    tipo_ci: student.tipo_ci,
    numero_ci: student.numero_ci,
    primer_nombre: student.primer_nombre,
    primer_apellido: student.primer_apellido,
    nombre_completo: nombreCompleto,
    fecha_nacimiento: toDateOnly(student.fecha_nacimiento),
    municipio_nacimiento: student.municipio_nacimiento,
    estado_nacimiento: student.estado_nacimiento,
    anio: latest ? latest.anio : null,
    seccion: latest ? latest.seccion : null,
    anio_escolar: latest ? latest.anio_escolar : null,
    representante: await buildRepresentante(student.id),
  }
}

/**
 * Resolve a student by cédula and return the printable summary.
 * @param {string} rawCedula
 * @returns {Promise<{ estudiante: object }>}
 * @throws {HttpError} 400 on a malformed cédula, 404 when no student matches
 */
async function verificar(rawCedula) {
  const cedula = parseCedula(rawCedula)
  if (!cedula) {
    throw HttpError.badRequest('Invalid cédula format', { cedula: 'must match V-12345678' })
  }

  const student = await db
    .tabla('estudiantes')
    .selectOne({ where: cedulaWhere(cedula.tipo_ci, cedula.numero_ci) })
  if (!student) {
    throw HttpError.notFound('Estudiante not found')
  }

  return { estudiante: await buildStudentSummary(student) }
}

/**
 * Record an emitted document for an existing student and return the persisted
 * row (with DB id and fecha_emision) plus the student summary.
 * @param {{ tipo: string, estudiante_id: number, usuario_id: number }} payload
 * @returns {Promise<{ documento: object, estudiante: object }>}
 * @throws {HttpError} 404 when the student does not exist
 */
async function emitir({ tipo, estudiante_id, usuario_id }) {
  const student = await db.tabla('estudiantes').selectById(estudiante_id)
  if (!student) {
    throw HttpError.notFound('Estudiante not found')
  }

  const inserted = await db
    .tabla('documentos_emitidos')
    .insert({ estudiante_id, tipo, usuario_id })
  const documento = await db
    .tabla('documentos_emitidos')
    .selectById(inserted.insertId)

  return { documento, estudiante: await buildStudentSummary(student) }
}

module.exports = { verificar, emitir }
