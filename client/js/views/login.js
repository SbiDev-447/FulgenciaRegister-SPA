// Full-screen login view. Rendered directly into #app (no shell) while the user
// is unauthenticated.

import { ApiError } from '../api.js'
import { login } from '../features/session.js'

/**
 * @param {HTMLElement} container
 * @param {{ onSuccess?: () => void }} [options]
 */
export function renderLogin(container, { onSuccess } = {}) {
  document.title = 'Iniciar sesión · Fulgencia Register'
  container.innerHTML = `
    <section class="login">
      <div class="login__card">
        <div class="login__header">
          <img class="login__shield" src="./assets/img/Shield-Liceo.webp" alt="Escudo del liceo" />
          <h1 class="login__title">Fulgencia Register</h1>
          <p class="login__subtitle">Inicia sesión para gestionar la inscripción estudiantil</p>
        </div>

        <div class="alert alert--error" id="login-error" role="alert" hidden></div>

        <form class="login__form" id="login-form" novalidate>
          <label class="field">
            <span class="field__label">Usuario</span>
            <input
              class="input"
              type="text"
              name="usuario"
              autocomplete="username"
              placeholder="admin"
              required
              autofocus
            />
          </label>

          <label class="field">
            <span class="field__label">Contraseña</span>
            <input
              class="input"
              type="password"
              name="password"
              autocomplete="current-password"
              placeholder="••••••••"
              required
            />
          </label>

          <button class="btn btn--primary btn--block" type="submit" id="login-submit">
            Iniciar sesión
          </button>
        </form>

        <p class="login__footer">Sistema de registro estudiantil · Liceo</p>
      </div>
    </section>
  `

  const form = container.querySelector('#login-form')
  const errorBox = container.querySelector('#login-error')
  const submitButton = container.querySelector('#login-submit')

  function showError(message) {
    errorBox.textContent = message
    errorBox.hidden = false
  }

  function setLoading(loading) {
    submitButton.disabled = loading
    submitButton.textContent = loading ? 'Verificando…' : 'Iniciar sesión'
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    errorBox.hidden = true

    const usuario = form.elements.usuario.value.trim()
    const password = form.elements.password.value

    if (!usuario || !password) {
      showError('Introduce usuario y contraseña.')
      return
    }

    setLoading(true)
    try {
      await login(usuario, password)
      onSuccess?.()
    } catch (error) {
      showError(error instanceof ApiError ? error.message : 'No se pudo iniciar sesión.')
      setLoading(false)
      form.elements.password.value = ''
      form.elements.password.focus()
    }
  })

  form.elements.usuario.focus()
}
