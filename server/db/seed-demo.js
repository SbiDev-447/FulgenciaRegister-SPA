'use strict'

// Demo data: wipe the people tables and load 30 varied students.
//
// It goes through `createEstudiante`, not raw INSERTs, so every row respects the
// same validation, representative linking and consigned-document rows the
// enrolment form produces. `usuarios` is deliberately untouched: the login has
// to keep working after the demo data is loaded.
//
// Run with: pnpm db:demo

const db = require('../src/config/db')
const { createEstudiante } = require('../src/modules/estudiantes/estudiantes.service')

/** Tables emptied before loading. Order does not matter with FK checks off. */
const DEMO_TABLES = [
  'documentos_emitidos',
  'documentos_consignados',
  'estudiante_representante',
  'inscripciones',
  'estudiantes',
  'representantes',
]

const NOMBRES_F = [
  'María', 'Camila', 'Valentina', 'Sofía', 'Gabriela', 'Isabella', 'Daniela', 'Andrea',
  'Lucía', 'Victoria', 'Paula', 'Emma', 'Renata', 'Antonella', 'Sara',
]

const NOMBRES_M = [
  'José', 'Carlos', 'Diego', 'Luis', 'Santiago', 'Miguel', 'Andrés', 'Daniel',
  'Alejandro', 'Jesús', 'Samuel', 'Tomás', 'Emilio', 'Rodrigo', 'Matías',
]

const SEGUNDOS_F = ['Isabel', 'Alejandra', 'Fernanda', 'Carolina', 'Beatriz', 'Mariana', '']
const SEGUNDOS_M = ['Antonio', 'Enrique', 'Rafael', 'Manuel', 'Eduardo', 'Alberto', '']

const APELLIDOS = [
  'Pérez', 'González', 'Rojas', 'Mendoza', 'Suárez', 'Torres', 'Vargas', 'Castillo',
  'Ramírez', 'Herrera', 'Silva', 'Quintero', 'Briceño', 'Contreras', 'Araujo',
  'Márquez', 'Colmenares', 'Peña', 'Ramos', 'Salazar',
]

const ORIGENES = [
  ['Trujillo', 'Miranda'],
  ['Zulia', 'Maracaibo'],
  ['Lara', 'Iribarren'],
  ['Táchira', 'San Cristóbal'],
  ['Mérida', 'Libertador'],
  ['Carabobo', 'Valencia'],
  ['Distrito Capital', 'Libertador'],
  ['Portuguesa', 'Guanare'],
  ['Barinas', 'Barinas'],
  ['Aragua', 'Girardot'],
]

const CURSOS = ['1er Año', '2do Año', '3er Año', '4to Año', '5to Año', '6to Año']
const SECCIONES = ['A', 'B', 'C']
const LATERALIDADES = ['Derecha', 'Izquierda']
const TALLAS = ['S', 'M', 'L', 'XL']
const ESTADOS_CIVILES = ['Soltero(a)', 'Casado(a)', 'Concubino(a)', 'Divorciado(a)']

const ALERGIAS = ['Ninguna', 'Penicilina', 'Maní', 'Polvo y ácaros', 'Lactosa']
const ENFERMEDADES = ['Ninguna', 'Asma', 'Rinitis alérgica', 'Anemia', 'Migraña']

/** Two siblings share a representative cédula; everyone looks the same shape. */
const HERMANOS = new Map([
  [11, 'V-14235678'],
  [12, 'V-14235678'],
])

const SIN_REPRESENTANTE = new Set([24, 25, 26])

/**
 * Deterministic, varied record for one index. No randomness: reloading the demo
 * gives the same classroom every time, which is what makes a bug reproducible.
 * @param {number} index 0..29
 */
function build(index) {
  const female = index % 2 === 0
  const nombre = female
    ? NOMBRES_F[(index * 3) % NOMBRES_F.length]
    : NOMBRES_M[(index * 3) % NOMBRES_M.length]
  const segundoNombre = female
    ? SEGUNDOS_F[index % SEGUNDOS_F.length]
    : SEGUNDOS_M[index % SEGUNDOS_M.length]
  const primerApellido = APELLIDOS[index % APELLIDOS.length]
  const segundoApellido = APELLIDOS[(index + 7) % APELLIDOS.length]
  const [estado, municipio] = ORIGENES[index % ORIGENES.length]

  // Ages spread over the primary range: the youngest enters 1er Año, the
  // oldest finishes 6to.
  const anioNacimiento = 2019 - Math.floor(index / 5)
  const mes = String((index % 12) + 1).padStart(2, '0')
  const dia = String(((index * 7) % 27) + 1).padStart(2, '0')
  const fechaNacimiento = `${anioNacimiento}-${mes}-${dia}`
  const curso = CURSOS[Math.floor(index / 5)]

  const estudiante = {
    tipo_ci: 'V',
    numero_ci: `31${String(100000 + index * 137).slice(0, 7)}`,
    primer_nombre: nombre,
    segundo_nombre: segundoNombre || null,
    primer_apellido: primerApellido,
    segundo_apellido: index % 6 === 5 ? null : segundoApellido,
    fecha_nacimiento: fechaNacimiento,
    sexo: female ? 'F' : 'M',
    pais_nacimiento: 'Venezuela',
    estado_nacimiento: estado,
    municipio_nacimiento: municipio,
    correo: `estudiante${index + 1}@colegio.ejemplo`,
    telefono: `04${['12', '14', '16', '24', '26'][index % 5]}-${String(3000000 + index * 113).slice(0, 7)}`,
    lateralidad: LATERALIDADES[index % LATERALIDADES.length],
    talla: TALLAS[index % TALLAS.length],
    peso: (18 + ((index * 7) % 28) + 0.5).toFixed(2),
    camisa: TALLAS[index % TALLAS.length],
    pantalon: TALLAS[(index + 1) % TALLAS.length],
    zapatos: String(26 + (index % 12)),
    direccion_habitacion: `Calle ${index + 1}, casa ${10 + index}, sector Los Pinos, ${municipio}`,
    alergico_a: ALERGIAS[index % ALERGIAS.length],
    enfermedades_padecidas: ENFERMEDADES[(index + 2) % ENFERMEDADES.length],
  }

  const inscripcion = {
    anio_escolar: index === 17 ? '2024-2025' : '2025-2026',
    anio: curso,
    seccion: SECCIONES[index % SECCIONES.length],
    regular: index !== 20,
    repite: index === 3 || index === 17,
    fecha_inscripcion: `2025-09-${String((index % 20) + 1).padStart(2, '0')}`,
    edad_inscripcion: 2025 - anioNacimiento,
  }

  const documentos = {
    partida_nacimiento: index % 9 !== 0,
    copia_cedula: index % 7 !== 0,
    boleta: index % 2 === 0,
    fotos: index % 3 === 0,
    carpeta: index !== 5,
    certificado_6to_grado: curso === '6to Año',
  }

  const representantes = []

  if (!SIN_REPRESENTANTE.has(index)) {
    const ciRepresentante = HERMANOS.get(index) ?? `V-${String(14000000 + index * 97)}`
    const parentesco = index % 3 === 0 ? 'Padre' : 'Madre'
    representantes.push({
      tipo_ci: 'V',
      numero_ci: ciRepresentante.replace(/^V-/, ''),
      nombre: `${parentesco === 'Padre' ? 'Carlos' : 'Ana'} ${primerApellido}`,
      fecha_nacimiento: `${1978 + (index % 8)}-${mes}-${dia}`,
      telefono: `04${['12', '14', '16', '24'][index % 4]}-${String(5000000 + index * 211).slice(0, 7)}`,
      correo: `representante${index + 1}@ejemplo.com`,
      estado_civil: ESTADOS_CIVILES[index % ESTADOS_CIVILES.length],
      direccion_habitacion: `Calle ${index + 1}, casa ${10 + index}, sector Los Pinos, ${municipio}`,
      parentesco,
    })
  }

  return { estudiante, inscripcion, representantes, documentos }
}

async function clean() {
  await db.query('SET FOREIGN_KEY_CHECKS = 0')
  try {
    for (const table of DEMO_TABLES) {
      await db.query(`TRUNCATE TABLE \`${table}\``)
    }
  } finally {
    await db.query('SET FOREIGN_KEY_CHECKS = 1')
  }
  console.log(`Demo: emptied ${DEMO_TABLES.join(', ')}`)
}

async function seed() {
  await clean()

  for (let index = 0; index < 30; index += 1) {
    const payload = build(index)
    await createEstudiante(payload)
  }

  const count = async (table) => (await db.query(`SELECT COUNT(*) AS total FROM ${table}`))[0].total

  console.log(
    `Demo: ${await count('estudiantes')} estudiantes, ${await count('inscripciones')} inscripciones, ` +
      `${await count('representantes')} representantes, ` +
      `${await count('estudiante_representante')} vínculos.`,
  )
}

seed()
  .then(() => db.end())
  .catch(async (error) => {
    console.error('Demo seeding failed:', error)
    await db.end().catch(() => {})
    process.exit(1)
  })
