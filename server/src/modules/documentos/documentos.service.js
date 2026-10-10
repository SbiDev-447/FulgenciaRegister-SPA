'use strict'

const db = require('../../config/db')
const { HttpError } = require('../../utils/httpError')
const { cedulaWhere } = require('../../utils/cedula')

// Venezuelan cédula: V/E prefix, optional dash, 1-12 digits. Matched against
// the trimmed, upper-cased input, so `v12345678` and `V-12345678` are equivalent.
const CEDULA_RE = /^([VE])-?(\d{1,12})$/

/**
 * Parse a cédula from its free-text form.
 * @param {unknown} raw
 * @returns {{ tipo_ci: string, numero_ci: string }|null} null when malformed
 */
function parseCedula(raw) {
  if (typeof raw !== 'string') {
    return null
  }
  const match = CEDULA_RE.exec(raw.trim().toUpperCase())
  if (!match) {
    return null
  }
  return { tipo_ci: match[1], numero_ci: match[2] }
}

/**
 * Printable student summary shared by verify and emit: identity, full name and
 * the data of the most recent inscription (MAX anio_escolar). Students without
 * inscriptions report null academic fields.
 * @param {object} student
 * @returns {Promise<object>}
 */
async function buildStudentSummary(student) {
  const inscriptions = await db
    .tabla('inscripciones')
    .select(null, null, { estudiante_id: student.id }, null, null, 'anio_escolar DESC')
  const latest = inscriptions[0] ?? null
  const nombreCompleto = `${student.primer_nombre ?? ''} ${student.primer_apellido ?? ''}`.trim()

  return {
    id: student.id,
    tipo_ci: student.tipo_ci,
    numero_ci: student.numero_ci,
    primer_nombre: student.primer_nombre,
    primer_apellido: student.primer_apellido,
    nombre_completo: nombreCompleto,
    anio: latest ? latest.anio : null,
    seccion: latest ? latest.seccion : null,
    anio_escolar: latest ? latest.anio_escolar : null,
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
    .selectOne(null, null, cedulaWhere(cedula.tipo_ci, cedula.numero_ci))
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
  const student = await db.tabla('estudiantes').selectOne(null, null, { id: estudiante_id })
  if (!student) {
    throw HttpError.notFound('Estudiante not found')
  }

  const inserted = await db
    .tabla('documentos_emitidos')
    .insert({ estudiante_id, tipo, usuario_id })
  const documento = await db
    .tabla('documentos_emitidos')
    .selectOne(null, null, { id: inserted.insertId })

  return { documento, estudiante: await buildStudentSummary(student) }
}

module.exports = { verificar, emitir }
