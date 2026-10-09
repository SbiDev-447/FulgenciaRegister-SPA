'use strict'

/**
 * Academic structure of the school.
 *
 * Sections available per year:
 *   1st and 2nd year -> A..F
 *   3rd year         -> A..E
 *   4th and 5th year -> A..D
 *
 * This module is the single source of truth on the backend. The client keeps a
 * mirror for instant rendering, but any persisted registration is validated here.
 */
const YEARS = [
  { id: 1, label: '1er Año', sections: ['A', 'B', 'C', 'D', 'E', 'F'] },
  { id: 2, label: '2do Año', sections: ['A', 'B', 'C', 'D', 'E', 'F'] },
  { id: 3, label: '3er Año', sections: ['A', 'B', 'C', 'D', 'E'] },
  { id: 4, label: '4to Año', sections: ['A', 'B', 'C', 'D'] },
  { id: 5, label: '5to Año', sections: ['A', 'B', 'C', 'D'] },
]

function findYear(yearLabel) {
  return YEARS.find((year) => year.label === yearLabel) ?? null
}

function isValidSection(yearLabel, section) {
  const year = findYear(yearLabel)
  return Boolean(year) && year.sections.includes(section)
}

function options() {
  return { years: YEARS }
}

module.exports = { YEARS, findYear, isValidSection, options }
