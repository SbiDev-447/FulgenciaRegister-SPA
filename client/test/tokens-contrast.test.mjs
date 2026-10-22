// Theme contrast guards.
//
// Twice now a token that works as a fill was used as ink and turned
// dark-on-dark in the dark theme: the sidebar's active item and the badges.
// These pairs are the ones that actually live together, so they are asserted
// together — the numbers, not a screenshot, are what keeps them honest.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')

/** Flat token map of one block; the file has no nested rules. */
function block(selector) {
  const start = css.indexOf(selector)
  assert.notEqual(start, -1, `missing ${selector} block`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const tokens = {}
  for (const match of css.slice(open + 1, close).matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})/g)) {
    tokens[match[1]] = match[2]
  }
  return tokens
}

const THEMES = [
  ['light', block(':root')],
  ['dark', block("[data-theme='dark']")],
]

/** WCAG AAA for large text; below this a pair reads as a theme bug. */
const MIN = 4.5

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const PAIRS = [
  // Primary buttons: the fill carries --color-primary-contrast as text.
  ['--color-primary', '--color-primary-contrast'],
  // Soft tint (sidebar active, badge, tag): its ink is --color-navy.
  ['--color-primary-soft', '--color-navy'],
]

for (const [background, foreground] of PAIRS) {
  for (const [theme, tokens] of THEMES) {
    test(`${theme}: ${foreground} stays readable on ${background}`, () => {
      const value = ratio(tokens[background]?.trim(), tokens[foreground]?.trim())
      assert.ok(value >= MIN, `${foreground} on ${background} is ${value.toFixed(2)}:1, under ${MIN}`)
    })
  }
}

/** Every .css under a directory, so a new view cannot slip past the check. */
function stylesheets(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      stylesheets(path, found)
    } else if (entry.name.endsWith('.css')) {
      found.push(path)
    }
  }
  return found
}

test('no fill token is used as ink', () => {
  // `--color-primary-strong` is a fill (button hover, gradient). Used as a
  // `color:` it was unreadable in the dark theme — that was the sidebar bug.
  const offenders = []
  for (const path of stylesheets(new URL('../styles', import.meta.url).pathname)) {
    const text = readFileSync(path, 'utf8')
    for (const match of text.matchAll(/^\s*color:\s*var\(--color-primary(?:-strong)?\)/gm)) {
      offenders.push(`${path.replace(/^.*\/styles\//, 'styles/')}: ${match[0].trim()}`)
    }
  }
  assert.deepEqual(offenders, [], 'fill tokens must not be used as text color')
})
