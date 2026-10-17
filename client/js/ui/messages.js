// Spanish copy for API rejections.
//
// The API contract (`server/src/utils/httpError.js`) keeps `message` in English
// for logs and tooling and expects the client to localize from `code`. So a view
// must never show `error.message` on its own: this module is the single place
// that turns a rejection into something a person can read.
//
// Pass the fallback that says what the call site was trying to do — it is what
// the user sees when the rejection carries no code we can name.

const BY_CODE = {
  bad_request: 'Revisa los datos enviados.',
  unauthorized: 'Tu sesión no está activa. Vuelve a iniciar sesión.',
  forbidden: 'No tienes permiso para hacer esto.',
  not_found: 'No se encontró el registro solicitado.',
  conflict: 'Ese registro ya existe.',
  network_error: 'No se pudo conectar con el servidor.',
}

const BY_STATUS = {
  500: 'Ocurrió un error en el servidor.',
  502: 'Ocurrió un error en el servidor.',
  503: 'Ocurrió un error en el servidor.',
}

/**
 * @param {{ code?: string, status?: number } | null | undefined} error
 * @param {string} [fallback] - what the call site was trying to do
 * @returns {string}
 */
export function errorCopy(error, fallback = 'Ocurrió un error inesperado.') {
  if (!error) return fallback
  // `Object.hasOwn`: a plain object literal inherits `constructor`, `toString`
  // and friends, so a rogue `code` would otherwise return a function instead of
  // copy a person can read.
  const code = error.code
  if (typeof code === 'string' && Object.hasOwn(BY_CODE, code)) return BY_CODE[code]
  const status = error.status
  if (typeof status === 'number' && Object.hasOwn(BY_STATUS, status)) return BY_STATUS[status]
  return fallback
}
