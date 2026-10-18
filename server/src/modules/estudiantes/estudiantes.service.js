'use strict'

const db = require('../../config/db')
const { HttpError } = require('../../utils/httpError')
const { cedulaWhere } = require('../../utils/cedula')
const { isValidSeccion } = require('./estudiantes.validators')

const STUDENT_FIELDS = [
  'tipo_ci',
  'numero_ci',
  'primer_nombre',
  'segundo_nombre',
  'primer_apellido',
  'segundo_apellido',
  'fecha_nacimiento',
  'sexo',
  'pais_nacimiento',
  'estado_nacimiento',
  'municipio_nacimiento',
  'correo',
  'telefono',
  'lateralidad',
  'talla',
  'peso',
  'camisa',
  'pantalon',
  'zapatos',
  'direccion_habitacion',
  'alergico_a',
  'enfermedades_padecidas',
]

const INSCRIPTION_FIELDS = [
  'anio',
  'seccion',
  'anio_escolar',
  'fecha_inscripcion',
  'regular',
  'repite',
  'docente_id',
]

const REPRESENTANTE_FIELDS = [
  'nombre',
  'tipo_ci',
  'numero_ci',
  'fecha_nacimiento',
  'telefono',
  'correo',
  'estado_civil',
  'direccion_habitacion',
]

const DOCUMENT_FIELDS = [
  'partida_nacimiento',
  'copia_cedula',
  'boleta',
  'fotos',
  'carpeta',
  'certificado_6to_grado',
]

/**
 * Copy the fields that are actually present in `source` into a plain object.
 * @param {object} source
 * @param {string[]} fields
 * @returns {object}
 */
function pick(source, fields) {
  const out = {}
  for (const key of fields) {
    if (source[key] !== undefined) {
      out[key] = source[key]
    }
  }
  return out
}

/**
 * Map validated boolean checkboxes to the tinyint(1) values the DB expects.
 * @param {object} documentos
 * @returns {object}
 */
function pickDocuments(documentos) {
  const out = {}
  for (const key of DOCUMENT_FIELDS) {
    if (documentos[key] !== undefined) {
      out[key] = documentos[key] ? 1 : 0
    }
  }
  return out
}

function toParentesco(value) {
  return value === undefined || value === null ? null : String(value)
}

/**
 * `regular` and `repite` are mutually exclusive by domain: a regular
 * registration is a new admission or a promotion to the next year, and the only
 * alternative is repeating the year — there is no third state. The controller
 * already guarantees both are booleans when present, so when either arrives the
 * other is derived: `repite: true` wins over a contradictory `regular: true`,
 * and turning `regular` back on clears `repite`.
 *
 * Mutates `data` in place and leaves it untouched when neither flag is present.
 * @param {{ regular?: boolean, repite?: boolean }} data
 */
function normalizeInscriptionStatus(data) {
  if (data.regular === undefined && data.repite === undefined) {
    return
  }
  const isRepeater = data.repite === true || data.regular === false
  data.regular = !isRepeater
  data.repite = isRepeater
}

function toDuplicateError(error) {
  // MySQL error 1062 / ER_DUP_ENTRY: the (tipo_ci, numero_ci) pair already exists.
  if (error && (error.errno === 1062 || error.code === 'ER_DUP_ENTRY')) {
    return HttpError.conflict('Duplicate record: the (tipo_ci, numero_ci) pair already exists')
  }
  return error
}

/**
 * Load the full record of one student: personal data, all inscriptions with
 * their consigned documents, and the linked representatives with parentesco.
 * @param {number} studentId
 * @returns {Promise<object|null>} null when the student does not exist
 */
async function getFullRecord(studentId) {
  const student = await db.tabla('estudiantes').selectOne(null, null, { id: studentId })
  if (!student) {
    return null
  }

  const inscripciones = await db
    .tabla('inscripciones')
    .select(null, null, { estudiante_id: studentId }, null, null, 'anio_escolar DESC')

  const insIds = inscripciones.map((row) => row.id)
  const docRows = insIds.length > 0
    ? await db.tabla('documentos_consignados').select(null, null, { inscripcion_id: insIds })
    : []
  const docsByInscripcion = new Map(docRows.map((row) => [row.inscripcion_id, row]))

  const withDocs = inscripciones.map((ins) => ({
    ...ins,
    documentos: docsByInscripcion.get(ins.id) ?? null,
  }))

  const links = await db
    .tabla('estudiante_representante')
    .select(null, null, { estudiante_id: studentId })
  const repIds = links.map((link) => link.representante_id)

  let representantes = []
  if (repIds.length > 0) {
    const reps = await db.tabla('representantes').select(null, null, { id: repIds })
    const repById = new Map(reps.map((rep) => [rep.id, rep]))
    representantes = links
      .map((link) => {
        const rep = repById.get(link.representante_id)
        return rep ? { ...rep, parentesco: link.parentesco } : null
      })
      .filter(Boolean)
  }

  return {
    estudiante: { ...student },
    inscripciones: withDocs,
    representantes,
  }
}

/**
 * Build the WHERE object for the free-text filter over the student's name and
 * cédula columns. `anio`/`seccion` filters join against inscripciones later.
 * @param {string|undefined} q
 * @returns {object|undefined} undefined when there is nothing to filter on
 */
function buildSearchWhere(q) {
  if (q === undefined || q === null || typeof q !== 'string' || q.trim() === '') {
    return undefined
  }
  const term = `%${q.trim()}%`
  return {
    'primer_nombre%': term,
    '||segundo_nombre%': term,
    '||primer_apellido%': term,
    '||segundo_apellido%': term,
    '||numero_ci%': term,
  }
}

/**
 * List students with optional filters. When `anio` or `seccion` is given the
 * list is restricted to students with a matching inscription; otherwise each
 * student shows their most recent inscripcion (string max of anio_escolar,
 * which sorts chronologically because it is YYYY-YYYY).
 * @param {{ q?: string, anio?: string, seccion?: string }} filters
 */
async function listEstudiantes(filters = {}) {
  const { q, anio, seccion } = filters

  const students = await db
    .tabla('estudiantes')
    .select(null, null, buildSearchWhere(q), null, null, 'primer_apellido, primer_nombre')

  const insWhere = {}
  if (anio) {
    insWhere.anio = anio
  }
  if (seccion) {
    insWhere.seccion = seccion
  }
  const inscriptions = await db
    .tabla('inscripciones')
    .select(null, null, Object.keys(insWhere).length > 0 ? insWhere : undefined, null, null, 'anio_escolar DESC')

  // First row per student is the most recent one because of the DESC order.
  const latestByStudent = new Map()
  for (const ins of inscriptions) {
    if (!latestByStudent.has(ins.estudiante_id)) {
      latestByStudent.set(ins.estudiante_id, ins)
    }
  }

  const estudiantes = []
  for (const student of students) {
    if ((anio || seccion) && !latestByStudent.has(student.id)) {
      continue
    }
    const ins = latestByStudent.get(student.id) ?? null
    estudiantes.push({
      id: student.id,
      tipo_ci: student.tipo_ci,
      numero_ci: student.numero_ci,
      primer_nombre: student.primer_nombre,
      primer_apellido: student.primer_apellido,
      sexo: student.sexo,
      telefono: student.telefono,
      anio: ins ? ins.anio : null,
      seccion: ins ? ins.seccion : null,
      anio_escolar: ins ? ins.anio_escolar : null,
    })
  }

  return { estudiantes }
}

/**
 * Reuse a representative by (tipo_ci, numero_ci) or insert a new one. Existing
 * rows are never overwritten (they may be shared by several students).
 * @param {{ tipo_ci: string, numero_ci: string }} data
 * @returns {Promise<{ id: number }>}
 */
async function findOrCreateRepresentante(data) {
  const existing = await db
    .tabla('representantes')
    .selectOne(null, null, cedulaWhere(data.tipo_ci, data.numero_ci))
  if (existing) {
    return { id: existing.id }
  }
  const inserted = await db.tabla('representantes').insert(pick(data, REPRESENTANTE_FIELDS))
  return { id: inserted.insertId }
}

/**
 * Insert the estudiante_representante links for a representative list and
 * return the resolved representative ids, reusing shared representatives.
 * @param {number} estudianteId
 * @param {Array} representantes
 * @returns {Promise<Array<{ id: number, parentesco: string|null }>>}
 */
async function linkRepresentantes(estudianteId, representantes) {
  const resolved = []
  for (const item of representantes) {
    const rep = await findOrCreateRepresentante(item)
    resolved.push({ id: rep.id, parentesco: toParentesco(item.parentesco) })
  }
  for (const entry of resolved) {
    await db
      .tabla('estudiante_representante')
      .insert({ estudiante_id: estudianteId, representante_id: entry.id, parentesco: entry.parentesco })
  }
  return resolved
}

/**
 * Transactional create: student + one inscription + its consigned documents
 * row + representative links. Any failure rolls the whole insert back.
 * @param {{ estudiante: object, inscripcion: object, representantes: Array, documentos?: object }} payload
 * @returns {Promise<object>} full record (same shape as GET /:id)
 */
async function createEstudiante(payload) {
  const { estudiante, inscripcion, representantes, documentos = {} } = payload

  // NOTE: transactions run on a single instance-global `_transactionConn`, so
  // two concurrent requests would share one connection. Acceptable for this
  // single-operator app; NEVER nest a transaction inside another.
  await db.beginTransaction()
  try {
    const studentInsert = await db.tabla('estudiantes').insert(pick(estudiante, STUDENT_FIELDS))
    const estudianteId = studentInsert.insertId

    const inscripcionData = {
      estudiante_id: estudianteId,
      ...pick(inscripcion, INSCRIPTION_FIELDS),
    }
    if (inscripcionData.regular === undefined) {
      inscripcionData.regular = true
    }
    if (inscripcionData.repite === undefined) {
      inscripcionData.repite = false
    }
    normalizeInscriptionStatus(inscripcionData)
    const inscripcionInsert = await db.tabla('inscripciones').insert(inscripcionData)
    const inscripcionId = inscripcionInsert.insertId

    await db
      .tabla('documentos_consignados')
      .insert({ inscripcion_id: inscripcionId, ...pickDocuments(documentos) })

    await linkRepresentantes(estudianteId, representantes)

    await db.commit()
    return getFullRecord(estudianteId)
  } catch (error) {
    await db.rollback().catch(() => {})
    throw toDuplicateError(error)
  }
}

/**
 * Transactional update. The cédula pair is immutable: any payload value that
 * differs from the stored pair is a 400. The inscription to touch is the one
 * identified by `inscripcion.anio_escolar`; its documents follow it.
 * @param {number} id
 * @param {{ estudiante?: object, inscripcion?: object, representantes?: Array, documentos?: object }} payload
 * @returns {Promise<object|null>} full record, or null when the student does not exist
 */
async function updateEstudiante(id, payload) {
  const { estudiante, inscripcion, representantes, documentos } = payload

  const existing = await db.tabla('estudiantes').selectOne(null, null, { id })
  if (!existing) {
    return null
  }

  if (
    estudiante &&
    ((estudiante.tipo_ci !== undefined && estudiante.tipo_ci !== existing.tipo_ci) ||
      (estudiante.numero_ci !== undefined && estudiante.numero_ci !== existing.numero_ci))
  ) {
    throw HttpError.badRequest('tipo_ci and numero_ci are immutable')
  }

  const hasChanges =
    (estudiante !== undefined && Object.keys(estudiante).length > 0) ||
    inscripcion !== undefined ||
    representantes !== undefined ||
    documentos !== undefined
  if (!hasChanges) {
    throw HttpError.badRequest('Nothing to update: provide estudiante, inscripcion, representantes or documentos')
  }

  // NOTE: transactions run on a single instance-global `_transactionConn`, so
  // two concurrent requests would share one connection. Acceptable for this
  // single-operator app; NEVER nest a transaction inside another.
  await db.beginTransaction()
  try {
    if (estudiante) {
      const sets = pick(estudiante, STUDENT_FIELDS)
      delete sets.tipo_ci
      delete sets.numero_ci
      if (Object.keys(sets).length > 0) {
        await db.tabla('estudiantes').update(sets, { id })
      }
    }

    if (inscripcion) {
      const ins = await db
        .tabla('inscripciones')
        .selectOne(null, null, { estudiante_id: id, anio_escolar: inscripcion.anio_escolar })
      if (!ins) {
        throw HttpError.notFound('Inscription not found for the given anio_escolar')
      }

      const effectiveAnio = inscripcion.anio !== undefined ? inscripcion.anio : ins.anio
      if (inscripcion.seccion !== undefined && !isValidSeccion(effectiveAnio, inscripcion.seccion)) {
        throw HttpError.badRequest('Invalid inscription data', { seccion: 'invalid section for the year' })
      }

      const sets = pick(inscripcion, INSCRIPTION_FIELDS)
      delete sets.anio_escolar // identifier of the row being updated, not editable
      normalizeInscriptionStatus(sets)
      if (Object.keys(sets).length > 0) {
        await db.tabla('inscripciones').update(sets, { id: ins.id })
      }

      if (documentos && Object.keys(documentos).length > 0) {
        const docRow = await db
          .tabla('documentos_consignados')
          .selectOne(null, null, { inscripcion_id: ins.id })
        const docSets = pickDocuments(documentos)
        if (docRow) {
          await db.tabla('documentos_consignados').update(docSets, { id: docRow.id })
        } else if (Object.keys(docSets).length > 0) {
          await db
            .tabla('documentos_consignados')
            .insert({ inscripcion_id: ins.id, ...docSets })
        }
      }
    }

    if (representantes !== undefined) {
      await reconcileRepresentantes(id, representantes)
    }

    await db.commit()
    return getFullRecord(id)
  } catch (error) {
    await db.rollback().catch(() => {})
    throw toDuplicateError(error)
  }
}

/**
 * Make the estudiante_representante links match the provided array: upsert each
 * representative (reuse by CI), remove links that are no longer present and
 * keep shared representatives untouched. Runs inside the caller's transaction.
 * @param {number} estudianteId
 * @param {Array} representantes
 */
async function reconcileRepresentantes(estudianteId, representantes) {
  const links = await db
    .tabla('estudiante_representante')
    .select(null, null, { estudiante_id: estudianteId })
  const currentById = new Map(links.map((link) => [link.representante_id, link]))

  const resolved = []
  for (const item of representantes) {
    const rep = await findOrCreateRepresentante(item)
    resolved.push({ id: rep.id, parentesco: toParentesco(item.parentesco) })
  }

  const targetIds = resolved.map((entry) => entry.id)
  const toRemove = [...currentById.keys()].filter((repId) => !targetIds.includes(repId))
  if (toRemove.length > 0) {
    // The OR-group must come first so it is AND-joined with the student id.
    await db
      .tabla('estudiante_representante')
      .delete({ representante_id: toRemove, estudiante_id: estudianteId })
  }

  for (const entry of resolved) {
    const link = currentById.get(entry.id)
    if (!link) {
      await db
        .tabla('estudiante_representante')
        .insert({ estudiante_id: estudianteId, representante_id: entry.id, parentesco: entry.parentesco })
    } else if ((link.parentesco ?? null) !== entry.parentesco) {
      await db
        .tabla('estudiante_representante')
        .update(
          { parentesco: entry.parentesco },
          { estudiante_id: estudianteId, representante_id: entry.id },
        )
    }
  }
}

/**
 * Hard delete: FKs cascade inscriptions, links and consigned documents. Shared
 * representatives survive because their rows are never touched; the ones left
 * with no student at all are garbage nobody can reach, so they go too. The
 * links must be read before the delete: the cascade erases them and with them
 * the only evidence of which representatives were linked here.
 * @param {number} id
 * @returns {Promise<boolean>} false when the student does not exist
 */
async function deleteEstudiante(id) {
  await db.beginTransaction()
  try {
    const existing = await db.tabla('estudiantes').selectOne(null, null, { id })
    if (!existing) {
      await db.rollback().catch(() => {})
      return false
    }

    const links = await db
      .tabla('estudiante_representante')
      .select(null, null, { estudiante_id: id })

    await db.tabla('estudiantes').delete({ id })

    for (const { representante_id: representanteId } of links) {
      const remaining = await db
        .tabla('estudiante_representante')
        .select(null, null, { representante_id: representanteId })
      if (remaining.length === 0) {
        await db.tabla('representantes').delete({ id: representanteId })
      }
    }

    await db.commit()
    return true
  } catch (error) {
    await db.rollback().catch(() => {})
    throw error
  }
}

module.exports = {
  listEstudiantes,
  getFullRecord,
  createEstudiante,
  updateEstudiante,
  deleteEstudiante,
  DOCUMENT_FIELDS,
}