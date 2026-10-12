// Documentos view — placeholder for a later slice (verify by cédula, emit, print).

import { renderPlaceholder } from './placeholder.js'

/**
 * @param {HTMLElement} container
 */
export function renderDocumentos(container) {
  renderPlaceholder(container, {
    title: 'Documentos',
    message:
      'Aquí irá la verificación de una cédula y la emisión de los cuatro documentos imprimibles: carta de aceptación, constancia de conducta, constancia de retiro y constancia de estudio.',
  })
}
