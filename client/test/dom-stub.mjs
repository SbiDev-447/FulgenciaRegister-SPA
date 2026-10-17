// Minimal fake DOM used to smoke-render the SPA inside Node.
//
// Why this exists: the client ships without a test runner (documented exception
// S8), so a broken render path used to stay invisible until somebody opened the
// browser. `node --check` only proves a file parses; it cannot see a runtime
// error such as assigning to an undeclared variable, which is exactly how the
// Estudiantes view stopped painting.
//
// This is a smoke harness, not a DOM implementation: it supports only what the
// views touch. `querySelectorAll` matches for real (so a test can assert the
// structure), while `querySelector` falls back to a stand-in node so a view
// never fails merely because the stub lacks an element.

class FakeNode {}

/** Match one compound selector: `div`, `.class`, `[attr]`, `input[type="x"]`. */
function matchesCompound(el, part) {
  if (!el || !part) return false
  let any = false

  const tag = /^[a-zA-Z][\w-]*/.exec(part)
  if (tag) {
    any = true
    if (el.tagName !== tag[0].toUpperCase()) return false
  }

  for (const [, cls] of part.matchAll(/\.([\w-]+)/g)) {
    any = true
    if (!el.classList.contains(cls)) return false
  }

  for (const [, name, value] of part.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)) {
    any = true
    if (!(name in el.attributes)) return false
    if (value !== undefined && el.attributes[name] !== value) return false
  }

  return any
}

/** Match a full selector, including `A B` descendant combinators and `a, b`. */
function matchesSelector(el, selector) {
  return String(selector)
    .split(',')
    .some((combinator) => {
      const steps = combinator.trim().split(/\s+/).filter(Boolean)
      if (steps.length === 0) return false
      if (!matchesCompound(el, steps[steps.length - 1])) return false

      let ancestor = el.parentElement
      for (let i = steps.length - 2; i >= 0; i -= 1) {
        let found = false
        while (ancestor) {
          if (matchesCompound(ancestor, steps[i])) {
            found = true
            ancestor = ancestor.parentElement
            break
          }
          ancestor = ancestor.parentElement
        }
        if (!found) return false
      }
      return true
    })
}

/** Every descendant of `root` matching `selector`, in document order. */
export function findAll(root, selector) {
  const out = []
  const visit = (node) => {
    for (const child of node.children) {
      if (child.nodeType === 3) continue
      if (matchesSelector(child, selector)) out.push(child)
      visit(child)
    }
  }
  visit(root)
  return out
}

/** Visible text of a subtree (what a user would read). */
export function textOf(node) {
  let text = typeof node.textContent === 'string' ? node.textContent : ''
  for (const child of node.children) text += ` ${textOf(child)}`
  return text.replace(/\s+/g, ' ').trim()
}

export function makeEl(tag) {
  const el = Object.assign(new FakeNode(), {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    children: [],
    attributes: {},
    className: '',
    textContent: '',
    style: {},
    dataset: {},
    hidden: false,
    disabled: false,
    value: '',
    checked: false,
    parentElement: null,

    classList: {
      contains: (cls) => el.className.split(/\s+/).filter(Boolean).includes(cls),
      add: (cls) => {
        if (!el.classList.contains(cls)) el.className = `${el.className} ${cls}`.trim()
      },
      remove: (cls) => {
        el.className = el.className
          .split(/\s+/)
          .filter((entry) => entry && entry !== cls)
          .join(' ')
      },
      toggle: (cls, force) => {
        const on = force ?? !el.classList.contains(cls)
        if (on) el.classList.add(cls)
        else el.classList.remove(cls)
        return on
      },
    },

    append(...kids) {
      for (const kid of kids) {
        if (kid && typeof kid === 'object') kid.parentElement = el
        el.children.push(kid)
      }
      return el
    },
    appendChild(kid) {
      el.append(kid)
      return kid
    },
    prepend(...kids) {
      for (const kid of kids) {
        if (kid && typeof kid === 'object') kid.parentElement = el
        el.children.unshift(kid)
      }
    },
    before(kid) {
      const parent = el.parentElement
      if (!parent) return
      if (kid && typeof kid === 'object') kid.parentElement = parent
      parent.children.splice(parent.children.indexOf(el), 0, kid)
    },
    replaceChildren(...kids) {
      el.children = []
      el.append(...kids)
    },
    remove() {
      const parent = el.parentElement
      if (!parent) return
      parent.children = parent.children.filter((child) => child !== el)
    },
    setAttribute(key, value) {
      el.attributes[key] = String(value)
    },
    getAttribute(key) {
      return key in el.attributes ? el.attributes[key] : null
    },
    removeAttribute(key) {
      delete el.attributes[key]
    },
    hasAttribute(key) {
      return key in el.attributes
    },
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    scrollIntoView() {},
    querySelectorAll(selector) {
      return findAll(el, selector)
    },
    querySelector(selector) {
      // Permissive on purpose: a stub gap must not make a view throw.
      return findAll(el, selector)[0] ?? makeEl('div')
    },
    closest(selector) {
      let node = el
      while (node) {
        if (matchesSelector(node, selector)) return node
        node = node.parentElement
      }
      return null
    },
    matches(selector) {
      return matchesSelector(el, selector)
    },
    get elements() {
      return new Proxy({}, { get: () => makeEl('input') })
    },
  })
  return el
}

/** Install the fake globals. Call once, before importing any view. */
export function installDom() {
  globalThis.Node = FakeNode
  globalThis.document = {
    body: makeEl('body'),
    documentElement: makeEl('html'),
    title: '',
    createElement: (tag) => makeEl(tag),
    createElementNS: (_ns, tag) => makeEl(tag),
    createTextNode: (text) => Object.assign(new FakeNode(), { nodeType: 3, textContent: String(text) }),
    getElementById: () => makeEl('div'),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
  }
  globalThis.window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    location: { hash: '' },
    innerWidth: 1280,
  }
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
  // Pending forever: a view's own error handling never runs, so a smoke test
  // only observes the synchronous render.
  globalThis.fetch = () => new Promise(() => {})
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)
}
