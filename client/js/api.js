// Thin API client for the Fulgencia backend. Every request is same-origin, so
// the httpOnly auth cookie travels automatically. Errors are normalized into
// ApiError using the backend envelope { code, message, details }, with Spanish
// copy taken from `code` — never from the backend's English `message`.

import { errorCopy } from './ui/messages.js'

const API_BASE = '/api'

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status - HTTP status, or 0 for a network failure
   * @param {string} [code]
   * @param {unknown} [details]
   */
  constructor(message, status, code, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * @param {string} path - path after /api, e.g. '/auth/login'
 * @param {{ method?: string, body?: unknown }} [options]
 * @returns {Promise<any>}
 */
async function request(path, { method = 'GET', body } = {}) {
  const options = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  }

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, options)
  } catch {
    throw new ApiError('No se pudo conectar con el servidor.', 0, 'network_error')
  }

  const raw = await response.text()
  let data = null
  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    // The api keeps its `message` in English for logs and tooling and expects
    // the client to localize from `code`, so the rejection is built with Spanish
    // copy here; a view that wants better wording calls `errorCopy` with its own
    // fallback.
    const code = data?.code
    throw new ApiError(errorCopy({ status: response.status, code }), response.status, code, data?.details)
  }

  return data
}

export const api = {
  /** @param {string} usuario @param {string} passwordDigest - SHA-256 hex */
  login: (usuario, passwordDigest) =>
    request('/auth/login', { method: 'POST', body: { usuario, password: passwordDigest } }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  opciones: () => request('/academico/opciones'),
  /**
   * Dashboard statistics.
   * @param {{ anio?: string, seccion?: string }} [filters] - years/sections
   *   labels as defined by /api/academico/opciones; omit for all.
   */
  estadisticas: ({ anio, seccion } = {}) => {
    const params = new URLSearchParams()
    if (anio) params.set('anio', anio)
    if (seccion) params.set('seccion', seccion)
    const qs = params.toString()
    return request(`/estadisticas${qs ? `?${qs}` : ''}`)
  },
  /**
   * Student list with optional filters.
   * @param {{ q?: string, anio?: string, seccion?: string }} [filters] - q is a
   *   free-text match over names and cédula; anio/seccion restrict to students
   *   with a matching inscription.
   */
  estudiantes: ({ q, anio, seccion } = {}) => {
    const params = new URLSearchParams()
    if (q && q.trim()) params.set('q', q.trim())
    if (anio) params.set('anio', anio)
    if (seccion) params.set('seccion', seccion)
    const qs = params.toString()
    return request(`/estudiantes${qs ? `?${qs}` : ''}`)
  },
  /** @param {number} id - full record: estudiante, inscripciones, representantes */
  estudiante: (id) => request(`/estudiantes/${id}`),
  /**
   * Create a student with their first inscription.
   * @param {{ estudiante: object, inscripcion: object, representantes: Array, documentos?: object }} payload
   */
  crearEstudiante: (payload) => request('/estudiantes', { method: 'POST', body: payload }),
}

/**
 * Hex-encoded SHA-256 digest. The backend expects the client to hash the raw
 * password before sending it; the plaintext never leaves the browser.
 * @param {string} value
 * @returns {Promise<string>}
 */
export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
