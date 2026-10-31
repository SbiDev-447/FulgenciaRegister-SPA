// Ajustes view: the institutional facts printed on every document, and the two
// housekeeping jobs that used to need a terminal.
//
// Settings are read from the API, never from localStorage: the director who
// signs and the logo on the letterhead belong to the school, so they have to be
// the same on every machine that prints.
//
// Markup is built with h() and textContent only (no innerHTML with data); the
// API sends English `message`s and `details`, so what a person reads comes from
// `errorCopy`/`code` and from the Spanish hints below.

import { h, clear } from '../ui/dom.js'
import { api } from '../api.js'
import { errorCopy } from '../ui/messages.js'
import { openModal } from '../ui/modal.js'
import { INSTITUTION } from '../institution.js'

/** Formats the server accepts, mirrored here to fail before uploading. */
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const DEFAULT_MAX_LOGO_BYTES = 2 * 1024 * 1024

/** The bundled logo, printed until somebody uploads the real one. */
const BUNDLED_LOGO = './assets/skeletons/LogoMinisterio-To-Left.webp'

const CARGO_OPTIONS = [
  { value: '', label: 'Selecciona…' },
  { value: 'Director', label: 'Director' },
  { value: 'Directora', label: 'Directora' },
]

/** What to say under a field the server rejected. Never the server's English. */
const FIELD_HINTS = {
  nombre: 'Escribe el nombre y apellido.',
  ci: 'Usa el formato V-12345678.',
  cargo: 'Elige Director o Directora.',
}

function kilobytes(bytes) {
  return `${Math.max(1, Math.round(Number(bytes ?? 0) / 1024))} KB`
}

/**
 * @param {HTMLElement} container
 * @param {{ user?: object }} [context]
 */
export function renderAjustes(container, { user } = {}) {
  const isAdmin = user?.rol === 'admin'
  const positions = CARGO_OPTIONS

  /* ------------------------------------------------------------------ status */

  function statusLine(name) {
    return h('p', { class: 'ajustes__status', id: `ajustes-${name}-status`, role: 'status' })
  }

  function setStatus(element, message, kind = '') {
    element.textContent = message
    element.className = kind ? `ajustes__status ajustes__status--${kind}` : 'ajustes__status'
  }

  /* ---------------------------------------------------------------- director */

  // The letterhead sets the name in capitals, and the server stores it that
  // way; the field shows it uppercased while typing so the form never promises
  // a lowercase name the document will not print.
  const nombreInput = h('input', {
    class: 'input ajustes__input--upper',
    name: 'nombre',
    type: 'text',
    placeholder: 'NOMBRE Y APELLIDO',
    autocomplete: 'off',
    autocapitalize: 'characters',
    maxlength: 120,
  })
  const ciInput = h('input', {
    class: 'input',
    name: 'ci',
    type: 'text',
    placeholder: 'V-12345678',
    autocomplete: 'off',
    maxlength: 20,
  })
  const cargoSelect = h('select', { class: 'input', name: 'cargo' })
  cargoSelect.append(...positions.map((option) => h('option', { value: option.value, text: option.label })))

  const fieldErrors = {
    nombre: h('span', { class: 'field__error' }),
    ci: h('span', { class: 'field__error' }),
    cargo: h('span', { class: 'field__error' }),
  }

  function directorField(label, control, name) {
    return h('label', { class: 'field' }, [
      h('span', { class: 'field__label', text: label }),
      control,
      fieldErrors[name],
    ])
  }

  function clearFieldErrors() {
    for (const element of Object.values(fieldErrors)) {
      element.textContent = ''
    }
  }

  const directorStatus = statusLine('director')
  const saveDirectorBtn = h('button', {
    class: 'btn btn--primary',
    type: 'submit',
  }, [h('span', { text: 'Guardar director' })])

  const directorForm = h('form', {
    class: 'ajustes__form',
    id: 'ajustes-director-form',
    on: {
      submit: (event) => {
        event.preventDefault()
        saveDirector()
      },
    },
  }, [
    directorField('Nombre y apellido', nombreInput, 'nombre'),
    directorField('Cédula', ciInput, 'ci'),
    directorField('Cargo', cargoSelect, 'cargo'),
    h('div', { class: 'ajustes__actions' }, [saveDirectorBtn]),
    directorStatus,
  ])

  async function saveDirector() {
    if (!isAdmin) {
      return
    }
    clearFieldErrors()
    saveDirectorBtn.disabled = true
    setStatus(directorStatus, 'Guardando…')

    try {
      const saved = await api.guardarDirector({
        nombre: nombreInput.value,
        ci: ciInput.value,
        cargo: cargoSelect.value,
      })
      nombreInput.value = saved.nombre
      ciInput.value = saved.ci
      cargoSelect.value = saved.cargo
      setStatus(directorStatus, 'Guardado. Los documentos ya salen con este director.', 'ok')
    } catch (error) {
      const details = error?.details ?? {}
      for (const [name, hint] of Object.entries(FIELD_HINTS)) {
        if (details[name]) {
          fieldErrors[name].textContent = hint
        }
      }
      setStatus(
        directorStatus,
        errorCopy(error, 'No se pudo guardar el director.'),
        'error',
      )
    } finally {
      saveDirectorBtn.disabled = !isAdmin
    }
  }

  /* -------------------------------------------------------------------- logo */

  const logoPreview = h('img', {
    class: 'ajustes__logo',
    alt: 'Logo del Ministerio',
    src: BUNDLED_LOGO,
  })

  const logoFile = h('input', {
    class: 'ajustes__file',
    type: 'file',
    accept: LOGO_TYPES.join(','),
    id: 'ajustes-logo-file',
  })

  const uploadLogoBtn = h('button', {
    class: 'btn btn--primary',
    type: 'button',
    on: { click: () => uploadLogo() },
  }, [h('span', { text: 'Actualizar logo' })])

  const logoStatus = statusLine('logo')
  const logoMeta = h('p', { class: 'ajustes__meta', text: 'Se imprime en la esquina izquierda de los cuatro documentos.' })
  let maxLogoBytes = DEFAULT_MAX_LOGO_BYTES

  const logoCard = h('article', { class: 'ajustes__card' }, [
    h('header', { class: 'ajustes__card-head' }, [
      h('h2', { class: 'ajustes__card-title', text: 'Logo del Ministerio' }),
    ]),
    h('div', { class: 'ajustes__logo-row' }, [
      h('div', { class: 'ajustes__logo-frame' }, [logoPreview]),
      h('div', { class: 'ajustes__logo-side' }, [
        logoMeta,
        h('label', { class: 'field' }, [
          h('span', { class: 'field__label', text: 'Imagen (PNG, JPEG o WebP, hasta 2 MB)' }),
          logoFile,
        ]),
        h('div', { class: 'ajustes__actions' }, [uploadLogoBtn]),
        logoStatus,
      ]),
    ]),
  ])

  async function uploadLogo() {
    if (!isAdmin) {
      return
    }
    const file = logoFile.files?.[0]
    if (!file) {
      setStatus(logoStatus, 'Elige una imagen primero.', 'error')
      return
    }
    if (!LOGO_TYPES.includes(file.type)) {
      setStatus(logoStatus, 'El archivo tiene que ser PNG, JPEG o WebP.', 'error')
      return
    }
    if (file.size > maxLogoBytes) {
      setStatus(logoStatus, `La imagen pesa ${kilobytes(file.size)} y el máximo es ${kilobytes(maxLogoBytes)}.`, 'error')
      return
    }

    uploadLogoBtn.disabled = true
    setStatus(logoStatus, 'Subiendo…')
    try {
      const saved = await api.subirLogo(file)
      logoPreview.src = saved.url
      logoFile.value = ''
      setStatus(logoStatus, `Logo actualizado (${kilobytes(saved.bytes)}).`, 'ok')
    } catch (error) {
      setStatus(logoStatus, errorCopy(error, 'No se pudo subir el logo.'), 'error')
    } finally {
      uploadLogoBtn.disabled = !isAdmin
    }
  }

  /* ------------------------------------------------------------ mantenimiento */

  const orphanSummary = h('p', { class: 'ajustes__meta', id: 'ajustes-orphans-summary', text: 'Sin revisar todavía.' })
  const orphanList = h('ul', { class: 'ajustes__orphans' })
  const reviewOrphansBtn = h('button', {
    class: 'btn btn--ghost',
    type: 'button',
    on: { click: () => reviewOrphans() },
  }, [h('span', { text: 'Revisar huérfanos' })])
  const purgeOrphansBtn = h('button', {
    class: 'btn btn--danger',
    type: 'button',
    disabled: true,
    on: { click: () => confirmPurge() },
  }, [h('span', { text: 'Eliminar huérfanos' })])
  const orphanStatus = statusLine('orphans')
  let orphanTotal = 0

  const backupBtn = h('button', {
    class: 'btn btn--primary',
    type: 'button',
    on: { click: () => runBackup() },
  }, [h('span', { text: 'Hacer backup' })])
  const backupStatus = statusLine('backup')

  async function reviewOrphans() {
    reviewOrphansBtn.disabled = true
    setStatus(orphanStatus, 'Revisando…')
    try {
      const { total, representantes } = await api.huerfanos()
      orphanTotal = Number(total ?? representantes?.length ?? 0)
      orphanSummary.textContent =
        orphanTotal === 0
          ? 'No hay representantes huérfanos.'
          : `${orphanTotal} representante(s) que ningún estudiante referencia.`
      orphanList.replaceChildren(
        ...(representantes ?? []).map((rep) =>
          h('li', { class: 'ajustes__orphan' }, [
            h('strong', { text: rep.nombre ?? '(sin nombre)' }),
            h('span', { class: 'ajustes__orphan-ci', text: `${rep.tipo_ci ?? ''}-${rep.numero_ci ?? ''}` }),
          ]),
        ),
      )
      purgeOrphansBtn.disabled = orphanTotal === 0
      setStatus(orphanStatus, '')
    } catch (error) {
      setStatus(orphanStatus, errorCopy(error, 'No se pudieron revisar los representantes.'), 'error')
    } finally {
      reviewOrphansBtn.disabled = false
    }
  }

  function confirmPurge() {
    const cancelBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, [h('span', { text: 'Cancelar' })])
    const confirmBtn = h('button', { class: 'btn btn--danger', type: 'button' }, [h('span', { text: 'Eliminar' })])

    const modal = openModal({
      title: 'Eliminar representantes huérfanos',
      content: h('p', {
        text: `Se eliminarán ${orphanTotal} representante(s) que ningún estudiante referencia. Esta acción no se puede deshacer.`,
      }),
      footer: [cancelBtn, confirmBtn],
    })

    cancelBtn.addEventListener('click', modal.close)
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true
      try {
        const { eliminados } = await api.purgarHuerfanos()
        modal.close()
        // Refresh the list first and report afterwards: the refresh clears the
        // status line, so the count has to be the last thing written.
        await reviewOrphans()
        setStatus(
          orphanStatus,
          `Se eliminaron ${eliminados?.length ?? 0} representante(s).`,
          'ok',
        )
      } catch (error) {
        confirmBtn.disabled = false
        setStatus(orphanStatus, errorCopy(error, 'No se pudieron eliminar los representantes.'), 'error')
        modal.close()
      }
    })
  }

  async function runBackup() {
    backupBtn.disabled = true
    setStatus(backupStatus, 'Creando backup…')
    try {
      const result = await api.backup()
      const tables = result?.tablas?.length ?? 0
      setStatus(
        backupStatus,
        `Backup creado: ${result.archivo} (${kilobytes(result.bytes)}, ${tables} tablas).`,
        'ok',
      )
    } catch (error) {
      const detail = error?.details?.backup
      setStatus(
        backupStatus,
        errorCopy(error, 'No se pudo crear el backup.'),
        'error',
      )
      if (typeof detail === 'string' && detail) {
        backupStatus.textContent = `${backupStatus.textContent} ${detail}`
      }
    } finally {
      backupBtn.disabled = false
    }
  }

  const maintenanceCard = h('article', { class: 'ajustes__card ajustes__card--wide' }, [
    h('header', { class: 'ajustes__card-head' }, [
      h('h2', { class: 'ajustes__card-title', text: 'Mantenimiento' }),
    ]),
    h('div', { class: 'ajustes__grid-2' }, [
      h('section', { class: 'ajustes__block' }, [
        h('h3', { class: 'ajustes__block-title', text: 'Representantes huérfanos' }),
        h('p', {
          class: 'ajustes__meta',
          text: 'Un representante queda huérfano cuando ya no tiene ningún estudiante a su cargo. Sólo se borran esos casos: si un papá tiene tres hijos en el liceo, se elimina cuando el último deja de tenerlo asignado.',
        }),
        orphanSummary,
        orphanList,
        h('div', { class: 'ajustes__actions' }, [reviewOrphansBtn, purgeOrphansBtn]),
        orphanStatus,
      ]),
      h('section', { class: 'ajustes__block' }, [
        h('h3', { class: 'ajustes__block-title', text: 'Backup de la base de datos' }),
        h('p', {
          class: 'ajustes__meta',
          text: 'Escribe un .sql con fecha y hora en la carpeta backups/ del proyecto. Ese archivo es el que se copia a un pendrive o se restaura en otra máquina.',
        }),
        h('div', { class: 'ajustes__actions' }, [backupBtn]),
        backupStatus,
      ]),
    ]),
  ])

  /* ---------------------------------------------------------------- montaje */

  const restrictedNote = isAdmin
    ? null
    : h('p', {
        class: 'alert alert--error',
        role: 'alert',
        text: 'Sólo un administrador puede cambiar los ajustes o ejecutar el mantenimiento.',
      })

  const view = h('section', { class: 'ajustes' }, [
    h('div', { class: 'ajustes__hero' }, [
      h('h1', { class: 'ajustes__title', text: 'Ajustes' }),
      h('p', {
        text: 'Apartado para el mantenimiento y actualización de datos del Sistema.',
      }),
    ]),
    restrictedNote,
    h('div', { class: 'ajustes__cards' }, [
      h('article', { class: 'ajustes__card' }, [
        h('header', { class: 'ajustes__card-head' }, [
          h('h2', { class: 'ajustes__card-title', text: 'Director o Directora actual' }),
        ]),
        h('p', {
          class: 'ajustes__meta',
          text: `Firma las cartas y constancias en lugar de "${INSTITUTION.director.name}".`,
        }),
        directorForm,
      ]),
      logoCard,
      isAdmin ? maintenanceCard : null,
    ]),
  ])

  clear(container)
  container.append(view)

  if (!isAdmin) {
    for (const control of [nombreInput, ciInput, cargoSelect, saveDirectorBtn, logoFile, uploadLogoBtn]) {
      control.disabled = true
    }
  }

  // Read the current values, then fill the form. A failure leaves the screen
  // usable (the form still submits) with the reason stated.
  api
    .ajustes()
    .then((data) => {
      if (Number.isFinite(data?.maxLogoBytes)) {
        maxLogoBytes = data.maxLogoBytes
      }

      const director = data?.director
      if (director) {
        nombreInput.value = director.nombre ?? ''
        ciInput.value = director.ci ?? ''
        cargoSelect.value = director.cargo ?? ''
      }

      if (data?.logo?.url) {
        logoPreview.src = data.logo.url
        setStatus(logoStatus, `Logo actualizado (${kilobytes(data.logo.bytes)}).`, 'ok')
      }
    })
    .catch((error) => {
      setStatus(directorStatus, errorCopy(error, 'No se pudieron cargar los ajustes.'), 'error')
    })

  return view
}
