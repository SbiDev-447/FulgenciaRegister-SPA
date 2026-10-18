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

  // Attributes are read from their own groups and then removed from the rest:
  // a `.` or a word inside a quoted value is data, not a class name, so
  // `[placeholder="correo@ejemplo.com"]` must not be read as "…and class `com`".
  const attributeParts = [...part.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)]
  const bare = part.replace(/\[[^\]]*\]/g, '')

  const tag = /^[a-zA-Z][\w-]*/.exec(bare)
  if (tag) {
    any = true
    if (el.tagName !== tag[0].toUpperCase()) return false
  }

  for (const [, cls] of bare.matchAll(/\.([\w-]+)/g)) {
    any = true
    if (!el.classList.contains(cls)) return false
  }

  for (const [, name, value] of attributeParts) {
    any = true
    if (!(name in el.attributes)) return false
    if (value !== undefined && el.attributes[name] !== value) return false
  }

  return any
}

/**
 * Split a selector into its combinator steps, keeping the spaces that live
 * inside `[...]`: `[placeholder="Primer nombre"]` is ONE step, the way a real
 * parser reads it, not two.
 * @param {string} combinator
 * @returns {string[]}
 */
function splitCombinator(combinator) {
  const steps = []
  let current = ''
  let depth = 0

  for (const char of combinator) {
    if (char === '[') depth += 1
    else if (char === ']') depth = Math.max(0, depth - 1)

    if (depth === 0 && /\s/.test(char)) {
      if (current) steps.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current) steps.push(current)
  return steps
}

/** Match a full selector, including `A B` descendant combinators and `a, b`. */
function matchesSelector(el, selector) {
  return String(selector)
    .split(',')
    .some((combinator) => {
      const steps = splitCombinator(combinator.trim())
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

/**
 * The form a button is associated with, the way a browser resolves it: the
 * nearest form ancestor, or the one named by its `form` attribute (the wizard's
 * footer sits outside the form it saves).
 * @param {object} button
 * @returns {object|null}
 */
function formOf(button) {
  const ancestor = button.closest('form')
  if (ancestor) return ancestor

  const id = button.getAttribute('form')
  if (!id) return null

  // Walk out through the ancestors looking for the named form as a sibling:
  // the footer and the form are both children of whatever hosts the view.
  let scope = button.parentElement
  while (scope) {
    const found = scope.children.find(
      (child) => child.tagName === 'FORM' && child.getAttribute('id') === id,
    )
    if (found) return found
    scope = scope.parentElement
  }
  return null
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
    listeners: {},
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
    addEventListener(type, handler) {
      ;(el.listeners[type] ??= []).push(handler)
    },
    removeEventListener(type, handler) {
      el.listeners[type] = (el.listeners[type] ?? []).filter((entry) => entry !== handler)
    },
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
    // The standard way to say "save this form": a view that wants to submit
    // without a real submit button calls this. Returns the pending work so a
    // test awaiting the click also awaits the submit it started.
    requestSubmit() {
      return dispatch(el, 'submit')
    },
  })

  // A real form hands out the same control for a given name every time, so a
  // test can set a value and have the submit handler read it back. Assigned
  // here, not as a literal getter: Object.assign reads getters while copying.
  el.elements = new Proxy({}, { get: (controls, name) => (controls[name] ??= makeEl('input')) })

  // A button's `type` reflects its attribute and defaults to "submit" — the rule
  // that makes a button without one dangerous inside a form, and the one the
  // wizard walked into. Reading `button.type` here gives what a browser would
  // use, whether the view set the attribute through `h()` or the property later.
  if (el.tagName === 'BUTTON') {
    Object.defineProperty(el, 'type', {
      get: () => el.attributes.type ?? 'submit',
      set: (value) => {
        el.attributes.type = String(value)
      },
      enumerable: true,
      configurable: true,
    })
  }

  // A real `<select>` answers `value` with the option a browser would have
  // picked — the one marked `selected`, else the first — and only an explicit
  // assignment overrides it. A plain string property made every select nobody
  // touched read as empty, so a form looked invalid for a reason that does not
  // exist in a browser.
  if (el.tagName === 'SELECT') {
    Object.defineProperty(el, 'value', {
      get: () => {
        if (el.assignedValue !== undefined) return el.assignedValue
        const options = findAll(el, 'option')
        if (options.length === 0) return ''
        const chosen = options.find((option) => 'selected' in option.attributes) ?? options[0]
        return chosen.value ?? ''
      },
      set: (value) => {
        el.assignedValue = String(value)
      },
      enumerable: true,
      configurable: true,
    })
    el.assignedValue = undefined
  }

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
    scrollTo() {},
  }
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
  // Pending forever by default: a view's own error handling never runs, so a
  // smoke test only observes the synchronous render. A test that wants to see
  // a rejection swaps it with `respondWith`.
  globalThis.fetch = stalledFetch
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)
}

/** A fetch that never settles. */
function stalledFetch() {
  return new Promise(() => {})
}

/** Replace the stubbed fetch, e.g. with a rejection the view has to show. */
export function respondWith(impl) {
  globalThis.fetch = impl
}

/** Put the never-settling fetch back, for the tests that follow. */
export function stallFetch() {
  globalThis.fetch = stalledFetch
}

/**
 * Fire the listeners registered for `type` on `target`, in order, and resolve
 * once every handler settles. Only the target is notified: the views under test
 * listen on the element they own (the form, the button), never on an ancestor.
 *
 * A click on a submit button also submits its form, modelled because leaving it
 * out hid a real bug: a browser runs a button's activation behavior *after* its
 * listeners, reading the button as it is by then. The wizard made "Siguiente"
 * into "Guardar inscripción" inside its own click handler, so reaching the last
 * step submitted the form and showed an error the user had not asked for.
 * Nothing here reacts to a form that no submit button points at, and only a
 * click is modelled — the stub is still not a browser.
 */
export async function dispatch(target, type, event = {}) {
  for (const handler of target.listeners?.[type] ?? []) {
    await handler({ preventDefault() {}, stopPropagation() {}, target, ...event })
  }

  // `type` as it stands now, not as it was when the click arrived.
  const buttonType = target.type ?? target.getAttribute?.('type')
  if (type === 'click' && target.tagName === 'BUTTON' && buttonType === 'submit' && !target.disabled) {
    const form = formOf(target)
    if (form) await dispatch(form, 'submit')
  }
}
