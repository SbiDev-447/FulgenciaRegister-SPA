// Inicio view: statistics dashboard. Consumes /api/estadisticas with optional
// year/section filters sourced from /api/academico/opciones; shows KPI cards
// and a per-year distribution. Markup is built with h() and textContent only
// (AGENTS/docs/ARQUITECTURA.md §6: no innerHTML with data).

import { h, clear } from '../ui/dom.js'
import { api } from '../api.js'
import { errorCopy } from '../ui/messages.js'

const fmt = new Intl.NumberFormat('es-VE')

/**
 * @param {HTMLElement} container
 * @param {{ user?: object }} [context]
 */
export function renderInicio(container, { user } = {}) {
  const nombre = user?.nombre ?? user?.usuario ?? ''
  const bienvenida = nombre ? `Bienvenido, ${nombre}` : 'Bienvenido'

  const anioSelect = h('select', {
    class: 'inicio__select',
    'aria-label': 'Filtrar por año',
    disabled: true,
  })
  const seccionSelect = h('select', {
    class: 'inicio__select',
    'aria-label': 'Filtrar por sección',
    disabled: true,
  })
  const results = h('div', { class: 'inicio__results' })

  const view = h('section', { class: 'inicio' }, [
    h('div', { class: 'inicio__hero' }, [
      h('h2', { text: bienvenida }),
      h('p', {
        text: 'Resumen de la inscripción: estudiantes, documentos emitidos y distribución por año.',
      }),
    ]),
    h('form', { class: 'inicio__filtros', on: { submit: (event) => event.preventDefault() } }, [
      h('label', { class: 'inicio__field' }, [
        h('span', { text: 'Año' }),
        anioSelect,
      ]),
      h('label', { class: 'inicio__field' }, [
        h('span', { text: 'Sección' }),
        seccionSelect,
      ]),
    ]),
    results,
  ])

  clear(container)
  container.append(view)

  // Incremented on every reload so a slow earlier response never overwrites a
  // newer one after the user changed filters.
  let seq = 0

  function numeric(value) {
    return fmt.format(value)
  }

  function renderStats(data) {
    const { estudiantes, documentosEmitidos, porAnio } = data

    const cards = [
      { label: 'Estudiantes', value: estudiantes.total },
      { label: 'Mujeres', value: estudiantes.mujeres },
      { label: 'Hombres', value: estudiantes.hombres },
      { label: 'Documentos emitidos', value: documentosEmitidos },
    ]

    const maxTotal = Math.max(...porAnio.map((row) => row.total), 1)

    const breakdown = h('article', { class: 'card inicio__breakdown' }, [
      h('h3', { text: 'Distribución por año' }),
      h('div', { class: 'inicio__rows' },
        porAnio.map((row) => {
          const pct = Math.round((row.total / maxTotal) * 100)
          return h('div', { class: 'inicio__row', dataset: { anio: row.anio } }, [
            h('span', { class: 'inicio__row-label', text: row.anio }),
            h('div', { class: 'inicio__bar', 'aria-hidden': 'true' }, [
              row.total > 0
                ? h('span', { class: 'inicio__bar-fill', style: { width: `${Math.max(pct, 3)}%` } })
                : null,
            ]),
            h('span', { class: 'inicio__row-total', text: numeric(row.total) }),
            h('span', { class: 'inicio__row-split', text: `${numeric(row.mujeres)} M · ${numeric(row.hombres)} H` }),
          ])
        }),
      ),
    ])

    results.replaceChildren(
      h('div', { class: 'inicio__stats' },
        cards.map((card) =>
          h('article', { class: 'card inicio__kpi' }, [
            h('span', { class: 'inicio__kpi-label', text: card.label }),
            h('strong', { class: 'inicio__kpi-value', text: numeric(card.value) }),
          ]),
        ),
      ),
      breakdown,
    )
  }

  function renderError(error) {
    const message = errorCopy(error, 'No se pudieron cargar las estadísticas.')
    results.replaceChildren(
      h('div', { class: 'inicio__error' }, [
        h('p', { text: message }),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: load } }, [
          h('span', { text: 'Reintentar' }),
        ]),
      ]),
    )
  }

  function load() {
    const id = ++seq
    results.replaceChildren(h('p', { class: 'inicio__status', text: 'Cargando estadísticas…' }))
    api
      .estadisticas({ anio: anioSelect.value, seccion: seccionSelect.value })
      .then((data) => {
        if (id === seq) renderStats(data)
      })
      .catch((error) => {
        if (id === seq) renderError(error)
      })
  }

  let options = null

  // Bound once: retries re-fill the options but must not stack handlers.
  anioSelect.addEventListener('change', () => {
    const year = (options?.years ?? []).find((entry) => entry.label === anioSelect.value)
    const sections = year ? year.sections : collectSections(options?.years ?? [])
    fillSections(sections)
    if (!sections.includes(seccionSelect.value)) {
      seccionSelect.value = ''
    }
    load()
  })
  seccionSelect.addEventListener('change', load)

  /** @param {{ years: Array<{ label: string, sections: string[] }> }} academic */
  function fillFilters(academic) {
    options = academic
    const years = options.years ?? []

    const allSections = collectSections(years)

    anioSelect.replaceChildren(
      h('option', { value: '', text: 'Todos los años' }),
      ...years.map((year) => h('option', { value: year.label, text: year.label })),
    )
    anioSelect.disabled = false
    anioSelect.value = ''

    fillSections(allSections)
    seccionSelect.value = ''
    seccionSelect.disabled = false

    load()
  }

  /** Union of every section label across all years, in first-seen order. */
  function collectSections(years) {
    const sections = []
    const seen = new Set()
    for (const year of years) {
      for (const section of year.sections) {
        if (!seen.has(section)) {
          seen.add(section)
          sections.push(section)
        }
      }
    }
    return sections
  }

  function fillSections(sections) {
    seccionSelect.replaceChildren(
      h('option', { value: '', text: 'Todas las secciones' }),
      ...sections.map((section) => h('option', { value: section, text: section })),
    )
  }

  function renderFiltersError(error) {
    const message = errorCopy(error, 'No se pudieron cargar los filtros.')
    results.replaceChildren(
      h('div', { class: 'inicio__error' }, [
        h('p', { text: message }),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: loadFilters } }, [
          h('span', { text: 'Reintentar' }),
        ]),
      ]),
    )
  }

  function loadFilters() {
    api
      .opciones()
      .then(fillFilters)
      .catch(renderFiltersError)
  }

  loadFilters()
}