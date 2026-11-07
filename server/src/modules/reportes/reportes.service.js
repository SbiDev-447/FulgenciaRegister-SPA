'use strict'

const db = require('../../config/db')

// Fields the attendance sheet prints. The service keeps the raw names so the
// client can compose "apellidos, nombres" exactly the way the school writes it.
const ROSTER_FIELDS = [
  'id',
  'tipo_ci',
  'numero_ci',
  'primer_nombre',
  'segundo_nombre',
  'primer_apellido',
  'segundo_apellido',
  'sexo',
  'telefono',
  'correo',
]

function apellidos(student) {
  return [student.primer_apellido, student.segundo_apellido].filter(Boolean).join(' ')
}

function nombres(student) {
  return [student.primer_nombre, student.segundo_nombre].filter(Boolean).join(' ')
}

/** Alphabetical by last name, then first name; accents do not move a row. */
function compareStudents(a, b) {
  return (
    apellidos(a).localeCompare(apellidos(b), 'es', { sensitivity: 'base' }) ||
    nombres(a).localeCompare(nombres(b), 'es', { sensitivity: 'base' })
  )
}

/**
 * The roster of one section for the printed attendance sheet.
 *
 * A section belongs to a grade *and* a school year: the same "2do Año / A"
 * exists every September. Only the most recent school year with inscriptions in
 * that section is printed, so an old repeated year cannot duplicate a student or
 * mix two cohorts on one sheet. Passing `anio_escolar` pins an older year.
 *
 * @param {{ anio: string, seccion: string, anio_escolar?: string }} filters
 * @returns {Promise<{
 *   filtros: { anio: string, seccion: string, anio_escolar: string|null },
 *   total: number,
 *   estudiantes: Array<object>,
 * }>}
 */
async function getSectionRoster({ anio, seccion, anio_escolar } = {}) {
  const where = { anio, seccion }
  if (anio_escolar) {
    where.anio_escolar = anio_escolar
  }

  const inscriptions = await db.tabla('inscripciones').select({ where })
  if (inscriptions.length === 0) {
    return {
      filtros: { anio, seccion, anio_escolar: anio_escolar ?? null },
      total: 0,
      estudiantes: [],
    }
  }

  // `YYYY-YYYY` sorts lexicographically, so the largest string is the newest.
  const resolvedYear =
    anio_escolar ??
    inscriptions.reduce(
      (latest, inscription) => (inscription.anio_escolar > latest ? inscription.anio_escolar : latest),
      '',
    )

  const scoped = inscriptions.filter((inscription) => inscription.anio_escolar === resolvedYear)
  const studentIds = [...new Set(scoped.map((inscription) => inscription.estudiante_id))]
  if (studentIds.length === 0) {
    return {
      filtros: { anio, seccion, anio_escolar: resolvedYear },
      total: 0,
      estudiantes: [],
    }
  }

  const rows = await db.tabla('estudiantes').select({ where: { id: studentIds } })
  const byId = new Map(rows.map((student) => [student.id, student]))

  const estudiantes = studentIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((student) =>
      Object.fromEntries(ROSTER_FIELDS.map((field) => [field, student[field] ?? null])),
    )
    .sort(compareStudents)

  return {
    filtros: { anio, seccion, anio_escolar: resolvedYear },
    total: estudiantes.length,
    estudiantes,
  }
}

module.exports = { getSectionRoster, ROSTER_FIELDS }
