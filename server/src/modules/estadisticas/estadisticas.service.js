'use strict'

const db = require('../../config/db')
const { YEARS } = require('../../constants/academic')

/**
 * Aggregate the dashboard cards.
 *
 * Semantics (documented defaults):
 * - `estudiantes`: students with at least one inscription matching the `anio`
 *   filter (if given) AND the `seccion` filter (if given); with no filters,
 *   every student with >= 1 inscription. Sex comes from `estudiantes.sexo`:
 *   F -> mujeres, M -> hombres.
 * - `porAnio`: one entry per year label in YEARS order, counting inscriptions
 *   whose `seccion` matches the `seccion` filter (if given). This is the
 *   distribution across years, so the `anio` filter does NOT restrict it.
 * - `documentosEmitidos`: count of `documentos_emitidos` rows whose
 *   `estudiante_id` belongs to the filtered student set from `estudiantes`
 *   above; with no filters it counts every row.
 *
 * @param {{ anio?: string, seccion?: string }} filters
 * @returns {Promise<object>}
 */
async function getEstadisticas(filters = {}) {
  const { anio, seccion } = filters

  const students = await db.tabla('estudiantes').select()
  const inscriptions = await db.tabla('inscripciones').select()
  const studentById = new Map(students.map((student) => [student.id, student]))

  // `estudiantes` card scope: students owning an inscription matching the
  // anio/seccion filters.
  const matchingIds = new Set()

  // `porAnio` accumulator, seeded so every year label is present in order.
  const porAnioByLabel = new Map(
    YEARS.map((year) => [year.label, { anio: year.label, total: 0, mujeres: 0, hombres: 0 }]),
  )

  for (const ins of inscriptions) {
    if ((!anio || ins.anio === anio) && (!seccion || ins.seccion === seccion)) {
      matchingIds.add(ins.estudiante_id)
    }

    if (!seccion || ins.seccion === seccion) {
      const entry = porAnioByLabel.get(ins.anio)
      if (entry) {
        const student = studentById.get(ins.estudiante_id)
        entry.total += 1
        if (student && student.sexo === 'F') {
          entry.mujeres += 1
        } else if (student && student.sexo === 'M') {
          entry.hombres += 1
        }
      }
    }
  }

  let total = 0
  let mujeres = 0
  let hombres = 0
  for (const id of matchingIds) {
    const student = studentById.get(id)
    if (!student) {
      continue
    }
    total += 1
    if (student.sexo === 'F') {
      mujeres += 1
    } else if (student.sexo === 'M') {
      hombres += 1
    }
  }

  let documentosEmitidos
  const hasFilter = Boolean(anio || seccion)
  if (!hasFilter) {
    documentosEmitidos = (await db.tabla('documentos_emitidos').select()).length
  } else if (matchingIds.size === 0) {
    documentosEmitidos = 0
  } else {
    documentosEmitidos = (
      await db.tabla('documentos_emitidos').select({ where: { estudiante_id: [...matchingIds] } })
    ).length
  }

  return {
    filtros: { anio: anio ?? null, seccion: seccion ?? null },
    estudiantes: { total, mujeres, hombres },
    porAnio: YEARS.map((year) => porAnioByLabel.get(year.label)),
    documentosEmitidos,
  }
}

module.exports = { getEstadisticas }
