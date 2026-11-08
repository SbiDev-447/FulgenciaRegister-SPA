'use strict'

const db = require('../../config/db')
const { YEARS, findYear } = require('../../constants/academic')

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
 *   cross-year panorama, so the `anio` filter does NOT restrict it.
 * - `porSeccion`: only when `anio` is given, one entry per section of that year
 *   (in the academic order), counting inscriptions in that year that also match
 *   the `seccion` filter. It is the year-scoped counterpart of `porAnio`, so
 *   the breakdown always answers the active filter instead of ignoring it.
 * - `documentosEmitidos`: count of `documentos_emitidos` rows whose
 *   `estudiante_id` belongs to the filtered student set from `estudiantes`
 *   above; with no filters it counts every row.
 * - `actualizadoEn`: ISO timestamp of the aggregation, so the dashboard can
 *   tell the user how fresh the numbers are.
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

  // `porSeccion` mirrors the same distribution, but scoped to the selected
  // year. It is empty when no year filter is active (the chart shows the
  // cross-year panorama instead).
  const porSeccion = anio
    ? (findYear(anio)?.sections ?? []).map((section) => ({
        seccion: section,
        total: 0,
        mujeres: 0,
        hombres: 0,
      }))
    : []
  const porSeccionByLabel = new Map(porSeccion.map((entry) => [entry.seccion, entry]))

  for (const ins of inscriptions) {
    if ((!anio || ins.anio === anio) && (!seccion || ins.seccion === seccion)) {
      matchingIds.add(ins.estudiante_id)
    }

    if (!seccion || ins.seccion === seccion) {
      const entry = porAnioByLabel.get(ins.anio)
      if (entry) {
        addToBreakdown(entry, studentById.get(ins.estudiante_id))
      }
    }

    if (anio && ins.anio === anio && (!seccion || ins.seccion === seccion)) {
      const entry = porSeccionByLabel.get(ins.seccion)
      if (entry) {
        addToBreakdown(entry, studentById.get(ins.estudiante_id))
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
    porSeccion,
    documentosEmitidos,
    actualizadoEn: new Date().toISOString(),
  }
}

/** Add one inscription to a {total,mujeres,hombres} accumulator by sex. */
function addToBreakdown(entry, student) {
  entry.total += 1
  if (student && student.sexo === 'F') {
    entry.mujeres += 1
  } else if (student && student.sexo === 'M') {
    entry.hombres += 1
  }
}

module.exports = { getEstadisticas }
