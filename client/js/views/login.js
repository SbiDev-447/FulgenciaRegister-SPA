// Full-screen login view. Rendered directly into #app (no shell) while the user
// is unauthenticated.

import { ApiError } from '../api.js'
import { login } from '../features/session.js'
import { h, clear } from '../ui/dom.js'

/**
 * @param {HTMLElement} container
 * @param {{ onSuccess?: () => void }} [options]
 */
export function renderLogin(container, { onSuccess } = {}) {
  document.title = 'Iniciar sesión · Fulgencia Register'

  const errorBox = h('div', { class: 'alert alert--error', id: 'login-error', role: 'alert', hidden: true })

  const usuarioInput = h('input', {
    class: 'input',
    type: 'text',
    name: 'usuario',
    autocomplete: 'username',
    placeholder: 'admin',
    required: true,
    autofocus: true,
  })

  const passwordInput = h('input', {
    class: 'input',
    type: 'password',
    name: 'password',
    autocomplete: 'current-password',
    placeholder: '••••••••',
    required: true,
  })

  const submitButton = h('button', {
    class: 'btn btn--primary btn--block',
    type: 'submit',
    id: 'login-submit',
    text: 'Iniciar sesión',
  })

  const form = h('form', { class: 'login__form', id: 'login-form', novalidate: true }, [
    h('label', { class: 'field' }, [
      h('span', { class: 'field__label', text: 'Usuario' }),
      usuarioInput,
    ]),
    h('label', { class: 'field' }, [
      h('span', { class: 'field__label', text: 'Contraseña' }),
      passwordInput,
    ]),
    submitButton,
  ])

  const view = h('section', { class: 'login' }, [
    h('div', { class: 'login__card' }, [
      h('div', { class: 'login__header' }, [
        h('img', { class: 'login__shield', src: './assets/img/Shield-Liceo.webp', alt: 'Escudo del liceo' }),
        h('h1', { class: 'login__title', text: 'Fulgencia Register' }),
        h('p', { class: 'login__subtitle', text: 'Inicia sesión para gestionar la inscripción estudiantil' }),
      ]),
      errorBox,
      form,
      h('p', { class: 'login__footer', text: 'Sistema de registro estudiantil · Liceo' }),
    ]),
  ])

  clear(container)
  container.append(view)

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