// Contact-format rules shared by the client forms (odd/tasks/higiene-datos.md
// S1-S2). The wizard mirrors the backend validators, but the backend has no
// email or phone format check, so the shape of what the user types is pinned
// here, where it can be tested without a DOM.

/** Separators a human writes inside a phone number; anything else is garbage. */
const PHONE_ALLOWED = /^[+()\d\s.-]+$/
const PHONE_MIN_DIGITS = 7
const PHONE_MAX_DIGITS = 15

/**
 * `algo@algo.algo`: no spaces, text on both sides of a single `@` and a dot in
 * the domain. Permissive on purpose: it rejects typos, not exotic-but-valid
 * addresses.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim())
}

/**
 * A phone written with digits and the usual separators, holding between 7 and
 * 15 digits. That range accepts `0414-1234567`, `+58 414 1234567` and
 * `(0212) 555.1234` while still refusing a text field's contents.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidPhone(value) {
  const text = String(value ?? '').trim()
  if (!PHONE_ALLOWED.test(text)) return false
  const digits = text.match(/\d/g)?.length ?? 0
  return digits >= PHONE_MIN_DIGITS && digits <= PHONE_MAX_DIGITS
}
