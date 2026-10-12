// Minimal hash router. Routing is hash-based because the server serves a single
// static index.html; every navigation is same-document (no page reload).

/**
 * Turn a location hash into a normalized path, e.g. '#/estudiantes' -> '/estudiantes'.
 * @param {string} hash
 * @returns {string}
 */
export function normalizePath(hash) {
  const value = (hash ?? '').replace(/^#/, '')
  if (value === '' || value === '/') {
    return '/'
  }
  return value.startsWith('/') ? value : `/${value}`
}

/**
 * @param {{
 *   resolve: (path: string) => any,
 *   onChange: (match: any, path: string) => void,
 * }} config
 */
export function createRouter({ resolve, onChange }) {
  function currentPath() {
    return normalizePath(window.location.hash)
  }

  function handle() {
    const path = currentPath()
    onChange(resolve(path), path)
  }

  /**
   * @param {string} path - e.g. '/estudiantes'
   * @param {{ replace?: boolean }} [options]
   */
  function go(path, { replace = false } = {}) {
    const normalized = normalizePath(path)
    if (normalized === currentPath()) {
      handle()
      return
    }
    if (replace) {
      window.location.replace(`#${normalized}`)
    } else {
      window.location.hash = normalized
    }
  }

  return {
    go,
    currentPath,
    start() {
      window.addEventListener('hashchange', handle)
      handle()
    },
  }
}
