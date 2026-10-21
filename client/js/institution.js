/**
 * Institutional data printed on the letterhead of every constancia.
 *
 * One live value, never history: a reprint is a new document, signed by whoever
 * holds the office today, so nothing here is kept per school year. `position`
 * is a field and not a literal because the office changes between Director and
 * Directora.
 *
 * PLACEHOLDER: the director block is fake on purpose — `V-00.000.000` is not a
 * person, and the name says so. Replace all three values with the real ones
 * before printing anything.
 */
export const POSITIONS = ['Director', 'Directora']

export const INSTITUTION = {
  school: 'Liceo Fulgencia Jiménez de Olmos',
  logo: './assets/img/Shield-Liceo.webp',
  director: {
    name: 'Persona de Prueba',
    ci: 'V-00.000.000',
    position: 'Directora',
  },
}
