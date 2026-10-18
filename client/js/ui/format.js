// Contact-format rules shared by the client forms (odd/tasks/higiene-datos.md
// S1-S2). The wizard mirrors the backend validators, but the backend has no
// email or phone format check, so the shape of what the user types is pinned
// here, where it can be tested without a DOM.
//
// The date pair lives here for the same reason: the wizard, the edit form and
// the ficha must read a date the same way, and that way is not the browser's.

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

/** A written date: one or two digits, a slash, the same, a slash, four digits. */
const LATAM_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

/** The separators a person reaches for inside a date. */
const DATE_SEPARATORS = /[-.]/g

/**
 * The same date with whatever separators it was written with turned into `/`,
 * and eight bare digits read as `ddmmaaaa`.
 *
 * The keypad on a phone offers the digits 0-9 and nothing else (`inputmode`),
 * so `01022010` is how a date actually arrives from a mobile keyboard.
 * @param {string} text
 * @returns {string}
 */
function normalizeDateSeparators(text) {
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 2)}/${text.slice(2, 4)}/${text.slice(4)}`
  return text.replace(DATE_SEPARATORS, '/')
}

/**
 * A date written the Latin American way, `dd/mm/aaaa`, as the `aaaa-mm-dd` the
 * API stores — or `null` when what was typed is not a real calendar date.
 *
 * Why a text field instead of `input[type=date]`: the native control's shown
 * order follows the browser's locale, not the page's (MDN). The same birth date
 * read `04/03/2010` in a Spanish browser and `03/04/2010` in an English one, so
 * the ficha and the field disagreed about the same stored value.
 *
 * `04-03-2010`, `4.3.2010` and `04032010` are all read the same way: refusing
 * them would only make somebody retype a date they already wrote correctly. The
 * US order is deliberately NOT among them — `2010-03-04` names the same date as
 * `2010/03/04` and neither can be told apart from a typo, so both are refused
 * instead of guessed.
 *
 * The day is rebuilt through `Date.UTC` and compared back, because JavaScript
 * rolls an impossible date over instead of rejecting it: `31/02` would silently
 * become March 3rd. Reading it back through UTC also keeps a machine's timezone
 * from shifting the day.
 *
 * @param {unknown} value
 * @returns {string|null} `aaaa-mm-dd`, or null when the text is not a real date
 */
export function parseLatamDate(value) {
  const match = LATAM_DATE.exec(normalizeDateSeparators(String(value ?? '').trim()))
  if (!match) return null
  const [, writtenDay, writtenMonth, year] = match
  const day = Number(writtenDay)
  const month = Number(writtenMonth)
  const date = new Date(Date.UTC(Number(year), month - 1, day))
  const caught =
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  if (!caught) return null
  return `${year}-${writtenMonth.padStart(2, '0')}-${writtenDay.padStart(2, '0')}`
}

/**
 * The other direction: a stored `aaaa-mm-dd` — or the ISO datetime the API
 * answers — as `dd/mm/aaaa`. An empty or unreadable value gives `''`, so the
 * caller decides what a missing date looks like.
 *
 * Single-digit parts are padded instead of refused: hiding a date the database
 * actually holds would be worse than normalizing how it reads.
 * @param {unknown} value
 * @returns {string}
 */
export function formatLatamDate(value) {
  const [year, month, day] = String(value ?? '').slice(0, 10).split('-')
  if (!year || !month || !day) return ''
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`
}

/** The longest a written date can be: `dd/mm/aaaa`. */
export const DATE_FIELD_LENGTH = 10

/**
 * The separators of a written date, placed while it is typed.
 *
 * It only ever APPENDS a `/`, and only to a value that grew. That is the whole
 * design, and it is deliberate: a mask that reformats from the digits silently
 * corrupts an edit made in the middle of the string (`04/03/2010` minus the `0`
 * of the month is `04/3/2010`, and rebuilding from `0432010` would invent a
 * different date). Growing-only also means backspace always works — the slash
 * does not come straight back, which is the thing people hate about date masks.
 *
 * @param {unknown} previous - the value before this keystroke
 * @param {unknown} next - the value the browser holds now
 * @returns {string} what the field should hold
 */
export function maskDateInput(previous, next) {
  const text = String(next ?? '')
  if (text.length <= String(previous ?? '').length) return text
  if (text.length > DATE_FIELD_LENGTH) return text
  if (/^\d{2}$/.test(text) || /^\d{2}\/\d{2}$/.test(text)) return `${text}/`
  return text
}
