'use strict'

const db = require('../../config/db')
const { HttpError } = require('../../utils/httpError')
const { parseCedula, cedulaWhere } = require('../../utils/cedula')

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
