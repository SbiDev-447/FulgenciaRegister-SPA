// The four printable letters are real HTML skeletons in assets/skeletons, and
// js/letter.js is what turns one into a filled document. These tests read the
// actual files on disk: a hole added to a skeleton without a value here fails
// now, in CI, instead of printing "[Algo]" in front of a parent.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  DOCUMENT_TYPES,
  latinDateParts,
  ageAt,
  letterValues,
  fillLetter,
  extractSheet,
} from '../js/letter.js'

function skeleton(file) {
  return fs.readFileSync(new URL(`../assets/skeletons/${file}`, import.meta.url), 'utf8')
}

const institucion = {
  school: 'Liceo Fulgencia Jiménez de Olmos',
  logo: './assets/img/Shield-Liceo.webp',
  director: { name: 'Rosa Núñez', ci: 'V-12.345.678', position: 'Directora' },
}

const estudiante = {
  id: 7,
  tipo_ci: 'V',
  numero_ci: '12345678',
  nombre_completo: 'Pérez López Ana María',
  fecha_nacimiento: '2012-04-10',
  municipio_nacimiento: 'Miranda',
  estado_nacimiento: 'Trujillo',
  anio: '4to Año',
  seccion: 'B',
  anio_escolar: '2026-2027',
  representante: {
    tipo_ci: 'V',
    numero_ci: '87654321',
    nombre_completo: 'Pérez María',
    parentesco: 'madre',
  },
}

test('an ISO date splits into the pieces a letter prints', () => {
  assert.deepEqual(latinDateParts('2026-10-21'), {
    day: 21,
    month: 10,
    year: 2026,
    monthName: 'octubre',
  })
  assert.equal(latinDateParts(''), null)
  assert.equal(latinDateParts('21/10/2026'), null)
})

test('age counts whole years and waits for the birthday', () => {
  assert.equal(ageAt('2012-04-10', '2026-10-21'), 14)
  assert.equal(ageAt('2012-12-01', '2026-10-21'), 13)
  assert.equal(ageAt('2012-04-10', '2012-04-09'), -1)
  assert.equal(ageAt(null, '2026-10-21'), null)
})

test('every document type has a skeleton that exists and a Spanish label', () => {
  for (const [slug, letter] of Object.entries(DOCUMENT_TYPES)) {
    assert.equal(typeof letter.label, 'string')
    assert.ok(letter.label.trim().length > 0, `${slug} needs a label`)
    assert.ok(fs.existsSync(new URL(`../assets/skeletons/${letter.file}`, import.meta.url)), letter.file)
  }
})

test('filling the study certificate leaves no hole behind', () => {
  const html = fillLetter(
    extractSheet(skeleton('constancia-estudio.html')),
    letterValues({ estudiante, fecha: '2026-10-21', institucion }),
  )

  assert.match(html, /Pérez López Ana María/)
  assert.match(html, /V-12345678/)
  assert.match(html, /4to Año/)
  assert.match(html, /2026 - 2027/)
  assert.match(html, /octubre/)
  assert.match(html, /Pérez María/)
  assert.match(html, /V-87654321/)
  assert.doesNotMatch(html, /\[[^\]\n]{2,60}\]/, 'a hole survived the fill')
  assert.doesNotMatch(html, /class="hole"/, 'a hole wrapper survived the fill')
  assert.doesNotMatch(html, /Persona de Prueba/, 'the director placeholder survived')
  assert.doesNotMatch(html, /V-00\.000\.000/, 'the director cédula placeholder survived')
  // The sheet is embedded in the app, not opened from its own folder, so a bare
  // `./logo.webp` would resolve against the app URL and print as its alt.
  assert.match(html, /src="\.\/assets\/skeletons\/LogoMinisterio-To-Left\.webp"/)
  assert.match(html, /src="\.\/assets\/skeletons\/Shield-to-Right\.webp"/)
  assert.doesNotMatch(html, /src="\.\/(?!assets\/skeletons\/)/)
  assert.match(html, /Rosa Núñez/)
  assert.match(html, /V-12\.345\.678/)
  assert.match(html, /Directora \(E\)/)
})

test('the withdrawal letter prints age and place of birth', () => {
  const html = fillLetter(
    extractSheet(skeleton('constancia-retiro.html')),
    letterValues({ estudiante, fecha: '2026-10-21' }),
  )

  assert.match(html, /de\s+edad 14,/)
  assert.match(html, /Miranda del estado\s+Trujillo/)
  assert.doesNotMatch(html, /\[[^\]\n]{2,60}\]/)
})

test('a student without a representative fills nothing instead of "null"', () => {
  const html = fillLetter(
    extractSheet(skeleton('constancia-estudio.html')),
    letterValues({ estudiante: { ...estudiante, representante: null }, fecha: '2026-10-21' }),
  )

  assert.doesNotMatch(html, /null|undefined/)
})

test('a name typed into the form cannot inject markup', () => {
  const html = fillLetter('<p>[Apellidos y Nombres del Estudiante]</p>', {
    '[Apellidos y Nombres del Estudiante]': '<b onmouseover="x()">Ana</b>',
  })

  assert.equal(html, '<p>&lt;b onmouseover=&quot;x()&quot;&gt;Ana&lt;/b&gt;</p>')
})

test('extracting the sheet drops the toolbar and the page chrome', () => {
  const sheet = extractSheet(skeleton('carta-aceptacion.html'))

  assert.match(sheet, /^<main class="sheet">/)
  assert.match(sheet, /<\/main>$/)
  assert.doesNotMatch(sheet, /class="toolbar"/)
  assert.doesNotMatch(sheet, /<html>|<head>|<title>/)
})
