// Stroke icons as SVG node data, rendered through dom.svgIcon(). Keeps every
// icon out of string markup: no innerHTML anywhere in the client.

import { svgIcon } from './dom.js'

const ICONS = {
  inicio: [
    ['path', { d: 'M3 10.5 12 3l9 7.5' }],
    ['path', { d: 'M5 9.6V21h14V9.6' }],
  ],
  estudiantes: [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: '9', cy: '7', r: '4' }],
    ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
    ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }],
  ],
  documentos: [
    ['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }],
    ['path', { d: 'M14 2v6h6' }],
  ],
  menu: [['path', { d: 'M3 6h18M3 12h18M3 18h18' }]],
  sun: [
    ['circle', { cx: '12', cy: '12', r: '4' }],
    ['path', { d: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' }],
  ],
  moon: [['path', { d: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z' }]],
  logout: [
    ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }],
    ['path', { d: 'M16 17l5-5-5-5' }],
    ['path', { d: 'M21 12H9' }],
  ],
  tools: [['path', { d: 'M14.7 6.3a4 4 0 0 0 5 5L21 21l-3 3-9.7-9.7a4 4 0 0 1-5-5L6 6z' }]],
  plus: [
    ['path', { d: 'M12 5v14' }],
    ['path', { d: 'M5 12h14' }],
  ],
  compass: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M15.5 8.5l-2 5-5 2 2-5z' }],
  ],
}

export { ICONS }

/** @param {keyof typeof ICONS} name */
export function icon(name, props = {}) {
  return svgIcon(ICONS[name], props)
}