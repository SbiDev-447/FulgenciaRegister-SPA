// Turns a printable letter skeleton into a filled document.
//
// The four formats live in assets/skeletons as real HTML, written by the school
// and reviewed by it, so this module does not describe a letter: it only fills
// the holes the school left, plus the signing director, whose name is constant
// for the whole term (js/institution.js).
//
// Option A for the PDF: the filled sheet is handed back to the DOM and printed
// with the browser's own print CSS. Nothing is drawn on a canvas, so the letter
// stays text, selectable and accessible.

import { INSTITUTION } from './institution.js'

/** Month names as a letter writes them, index 0 = January. */
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** The four printable documents: persisted slug, Spanish label and skeleton. */
export const DOCUMENT_TYPES = {
  carta_aceptacion: { label: 'Carta de Aceptación', file: 'carta-aceptacion.html' },
  constancia_conducta: { label: 'Constancia de Conducta', file: 'constancia-conducta.html' },
  constancia_retiro: { label: 'Constancia de Retiro', file: 'constancia-retiro.html' },
  constancia_estudio: { label: 'Constancia de Estudio', file: 'constancia-estudio.html' },
}

/**
 * Split an ISO date (`YYYY-MM-DD`) into the pieces a letter prints. Parsed as
 * text on purpose: `new Date(iso)` reads it as UTC midnight, which shifts the
 * day for every zone west of Greenwich.
 * @param {string} iso
 * @returns {{ day: number, month: number, year: number, monthName: string }|null}
 */
export function latinDateParts(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  if (!match) {
    return null
  }
  const month = Number(match[2])
  return {
    day: Number(match[3]),
    month,
    year: Number(match[1]),
    monthName: MONTHS[month - 1] ?? '',
  }
}

/**
 * Whole years between two ISO dates, or null when either is unusable. The age a
 * letter states is the age on the issue date, not today.
 * @param {string} birthIso
 * @param {string} onIso
 * @returns {number|null}
 */
export function ageAt(birthIso, onIso) {
  const birth = latinDateParts(birthIso)
  const on = latinDateParts(onIso)
  if (!birth || !on) {
    return null
  }
  const birthdayPassed = on.month > birth.month || (on.month === birth.month && on.day >= birth.day)
  return on.year - birth.year - (birthdayPassed ? 0 : 1)
}

/**
 * `2026-2027` is how the API stores the school year; a letter writes
 * `2026 - 2027`. An already spaced value is left alone.
 * @param {string} value
 * @returns {string}
 */
function schoolYear(value) {
  const text = String(value ?? '')
  return /^\d{4}-\d{4}$/.test(text) ? text.replace('-', ' - ') : text
}

/** `V-12345678`, or an empty string when there is nobody to print. */
function cedula(person) {
  if (!person?.tipo_ci || !person?.numero_ci) {
    return ''
  }
  return `${person.tipo_ci}-${person.numero_ci}`
}

/**
 * Every string a skeleton carries a hole for, mapped to its value.
 * @param {{ estudiante: object, fecha: string, institucion?: object }} input
 *   `fecha` is the ISO issue date the letter is dated with.
 * @returns {Record<string, string|number>}
 */
export function letterValues({ estudiante, fecha, institucion = INSTITUTION }) {
  const student = estudiante ?? {}
  const repr = student.representante ?? null
  const issued = latinDateParts(fecha)
  const director = institucion?.director ?? {}
  const position = director.position ?? ''

  return {
    '[Apellidos y Nombres del Estudiante]': student.nombre_completo,
    '[Cedula del Estudiante]': cedula(student),
    '[Año de Estudio]': student.anio,
    '[Año Escolar]': schoolYear(student.anio_escolar),
    '[Representante]': repr?.nombre_completo,
    '[Cedula del Representante]': cedula(repr),
    '[Edad]': ageAt(student.fecha_nacimiento, fecha),
    '[municipio]': student.municipio_nacimiento,
    '[Estado]': student.estado_nacimiento,
    '[día]': issued?.day,
    '[mes]': issued?.monthName,
    '[año]': issued?.year,
    '[Cargo]': position,
    // The director placeholders are the skeleton's own text, mirrored here.
    'PROF. Persona de Prueba': `PROF. ${director.name ?? ''}`,
    'N°V-00000000 Director (E)': `N°${director.ci ?? ''} ${position} (E)`,
    'Lcdo. Persona de Prueba': `Lcdo. ${director.name ?? ''}`,
    'C.I. V-00.000.000': `C.I. ${director.ci ?? ''}`,
  }
}

/** Escape a value for a text hole. Holes never sit inside attributes. */
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * A needle as a pattern that tolerates the HTML source's line breaks: the
 * skeleton wraps "PROF. Persona de Prueba" over two lines to stay readable.
 */
function needlePattern(needle) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(escaped.replace(/\s+/g, '\\s+'), 'g')
}

/**
 * Replace every hole in a skeleton with its escaped value. Unknown holes are
 * left untouched, which is what the tests catch.
 * @param {string} template
 * @param {Record<string, string|number>} values
 * @returns {string}
 */
export function fillLetter(template, values) {
  let html = String(template ?? '')
  for (const [hole, value] of Object.entries(values ?? {})) {
    const text = escapeHtml(value ?? '')
    // Function replacement: an escaped value may contain `$&`-like sequences
    // that String.replace would otherwise interpret.
    html = html.replace(needlePattern(hole), () => text)
  }
  // A filled hole is a value, not a placeholder: drop the highlight wrapper so
  // the letter on screen is not a field of yellow boxes. The stand-alone
  // skeleton keeps its own, which is what the school edits.
  return html.replace(/<span class="hole">([^<]*)<\/span>/g, '$1')
}

/** Where the skeleton's sibling assets live, relative to the app document. */
const ASSET_BASE = './assets/skeletons/'

/**
 * The printable part of a skeleton: everything from `<main class="sheet">` on.
 * The rest is the stand-alone page chrome (toolbar, `<head>`), which belongs to
 * opening the file directly and not to the application.
 *
 * Image `src` values are rebased: the logos are siblings of the skeleton file,
 * and once the sheet is embedded in the app a bare `./x.webp` would resolve
 * against the app URL, 404, and print as its alt text.
 * @param {string} html
 * @returns {string}
 */
export function extractSheet(html) {
  const match = /<main class="sheet">[\s\S]*<\/main>/.exec(String(html ?? ''))
  if (!match) {
    return ''
  }
  return match[0].replace(/(<img\b[^>]*\bsrc=")\.\/([^"]+)(")/g, `$1${ASSET_BASE}$2$3`)
}
