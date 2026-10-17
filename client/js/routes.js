// The route table: which path paints which view.
//
// It lives apart from the bootstrap so the mapping can be read — and asserted in
// a test — without booting the application.

import { renderInicio } from './views/inicio.js'
import { renderEstudiantes } from './views/estudiantes.js'
import { renderInscripcion } from './views/inscripcion.js'
import { renderDocumentos } from './views/documentos.js'

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 *   view: (container: HTMLElement, options: object) => unknown,
 *   activePath?: string,
 * }} Route
 */

/** @type {Route[]} */
export const ROUTES = [
  { path: '/', title: 'Inicio', view: renderInicio },
  { path: '/estudiantes', title: 'Estudiantes', view: renderEstudiantes },
  {
    path: '/inscripcion',
    title: 'Nueva inscripción',
    view: renderInscripcion,
    // The wizard has no sidebar entry of its own: it is a step of Estudiantes,
    // so that item stays highlighted for as long as the form is open.
    activePath: '/estudiantes',
  },
  { path: '/documentos', title: 'Documentos', view: renderDocumentos },
]

/** @param {string} path @returns {Route|null} */
export function resolve(path) {
  return ROUTES.find((route) => route.path === path) ?? null
}
