// Client-side session state. The auth cookie is httpOnly, so the SPA never reads
// it: it verifies the session by calling GET /api/auth/me on boot.

import { api, sha256Hex, ApiError } from '../api.js'

const state = {
  /** @type {{ id: number, usuario: string, nombre: string, rol: string } | null} */
  user: null,
  ready: false,
}

export function getUser() {
  return state.user
}

export function isAuthenticated() {
  return state.user !== null
}

export function isReady() {
  return state.ready
}

/**
 * Resolve the current session from the server. Any auth failure simply means
 * "not logged in"; the state is always marked ready afterwards.
 * @returns {Promise<object|null>}
 */
export async function loadSession() {
  try {
    const data = await api.me()
    state.user = data.usuario
  } catch (error) {
    state.user = null
    if (!(error instanceof ApiError)) {
      throw error
    }
  } finally {
    state.ready = true
  }
  return state.user
}

/**
 * Hash the password, authenticate and store the returned user.
 * @param {string} usuario
 * @param {string} password - raw password from the form
 * @returns {Promise<object>}
 */
export async function login(usuario, password) {
  const digest = await sha256Hex(password)
  const data = await api.login(usuario, digest)
  state.user = data.usuario
  return state.user
}

/** Clear the session server-side and locally. */
export async function logout() {
  try {
    await api.logout()
  } finally {
    state.user = null
  }
}
