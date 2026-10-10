'use strict'

/**
 * Single source of truth for the four printable document types. Each type keeps
 * an English slug (the persisted value) and the Spanish label shown to users.
 */
const TIPOS = [
  { slug: 'carta_aceptacion', label: 'Carta de Aceptación' },
  { slug: 'constancia_conducta', label: 'Constancia de Conducta' },
  { slug: 'constancia_retiro', label: 'Constancia de Retiro' },
  { slug: 'constancia_estudio', label: 'Constancia de Estudio' },
]

const TIPOS_SLUGS = TIPOS.map((tipo) => tipo.slug)

/**
 * @param {string} slug
 * @returns {{ slug: string, label: string }|null}
 */
function findTipo(slug) {
  return TIPOS.find((tipo) => tipo.slug === slug) ?? null
}

function options() {
  return { tipos: TIPOS }
}

module.exports = { TIPOS, TIPOS_SLUGS, findTipo, options }
