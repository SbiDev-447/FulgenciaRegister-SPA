// Estudiantes view — placeholder for the next slice (list, search, record, form).

import { renderPlaceholder } from './placeholder.js'

/**
 * @param {HTMLElement} container
 */
export function renderEstudiantes(container) {
  renderPlaceholder(container, {
    title: 'Estudiantes',
    message:
      'Aquí irá el listado con búsqueda por nombre o cédula, la ficha completa del estudiante y el formulario de inscripción con representantes y documentos consignados.',
  })
}
