// Minimal DOM helpers. Per AGENTS/docs/ARQUITECTURA.md §6: never build markup
// with innerHTML + user data; construct nodes with `h()` and set text with
// `textContent` instead (XSS-safe by construction).

/**
 * Create an element with props and children.
 * - `class`/`className`, `text`, `dataset`, `style` get special handling.
 * - `on` is an object of event listeners; `on<Event>` keys work too.
 * - Boolean attributes (`disabled`, `hidden`, `required`, ...) are set when truthy.
 * - `value`/`checked` are set as properties (form inputs).
 * - Everything else becomes an attribute.
 */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag)
  applyProps(el, props)
  appendChildren(el, children)
  return el
}

export function clear(el) {
  el.replaceChildren()
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Build an inline SVG from node data `[[tag, attrs], ...]` (see icons.js). */
export function svgIcon(nodes, props = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    svg.setAttribute(key, String(value))
  }
  for (const [childTag, attrs] of nodes) {
    const node = document.createElementNS(SVG_NS, childTag)
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, String(value))
    }
    svg.append(node)
  }
  return svg
}

const BOOLEAN_ATTRS = new Set([
  'autofocus',
  'checked',
  'disabled',
  'hidden',
  'multiple',
  'novalidate',
  'readonly',
  'required',
])

function applyProps(el, props) {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'class' || key === 'className') {
      el.className = value
    } else if (key === 'text') {
      el.textContent = value
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value)
    } else if (key === 'style') {
      Object.assign(el.style, value)
    } else if (key === 'on') {
      for (const [type, handler] of Object.entries(value)) {
        el.addEventListener(type, handler)
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value)
    } else if (key === 'value' || key === 'checked') {
      el[key] = value
    } else if (BOOLEAN_ATTRS.has(key)) {
      el.setAttribute(key, '')
    } else {
      el.setAttribute(key, String(value))
    }
  }
}

function appendChildren(el, children) {
  const list = Array.isArray(children) ? children : [children]
  for (const child of list) {
    if (child === null || child === undefined || child === false || child === '') continue
    el.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
}