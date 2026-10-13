// Estudiantes view: student list with search and year/section filters, the
// full record modal (ficha) and the inscription form. Consumes /api/estudiantes*
// and /api/academico/opciones. Markup is built with h() and textContent only
// (AGENTS/docs/ARQUITECTURA.md §6: no innerHTML with data).

import { h, clear } from '../ui/dom.js'
import { api } from '../api.js'
import { icon } from '../ui/icons.js'

const fmt = new Intl.NumberFormat('es-VE')

/**
 * @param {HTMLElement} container
 */
export function renderEstudiantes(container) {
  const qInput = h('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Buscar por nombre o cédula…',
    'aria-label': 'Buscar estudiantes por nombre o cédula',
  })
  const anioSelect = h('select', {
    class: 'estudiantes__select',
    'aria-label': 'Filtrar por año',
    disabled: true,
  })
  const seccionSelect = h('select', {
    class: 'estudiantes__select',
    'aria-label': 'Filtrar por sección',
    disabled: true,
  })
  const results = h('div', { class: 'estudiantes__results' })

  const nuevaBtn = h('button', { class: 'btn btn--primary', type: 'button' }, [
    icon('plus'),
    h('span', { text: 'Nueva inscripción' }),
  ])

  const view = h('section', { class: 'estudiantes' }, [
    h('div', { class: 'estudiantes__hero' }, [
      h('h2', { text: 'Estudiantes' }),
      h('p', {
        text: 'Listado del registro: busca por nombre o cédula y filtra por año y sección.',
      }),
    ]),
    h('div', { class: 'estudiantes__bar' }, [
      h('form', { class: 'estudiantes__toolbar', on: { submit: (event) => event.preventDefault() } }, [
        h('div', { class: 'estudiantes__search' }, [qInput]),
        h('label', { class: 'estudiantes__field' }, [
          h('span', { text: 'Año' }),
          anioSelect,
        ]),
        h('label', { class: 'estudiantes__field' }, [
          h('span', { text: 'Sección' }),
          seccionSelect,
        ]),
      ]),
      nuevaBtn,
    ]),
    results,
  ])

  clear(container)
  container.append(view)

  // Incremented on every reload so a slow earlier response never overwrites a
  // newer one after the user changed search terms or filters.
  let seq = 0

  // Options from /api/academico/opciones; kept so the year change handler can
  // resolve the sections of the selected year without another fetch.
  let options = null

  function sexoLabel(value) {
    return value === 'F' ? 'Femenino' : value === 'M' ? 'Masculino' : '—'
  }

  function ciText(student) {
    return student ? `${student.tipo_ci}-${student.numero_ci}` : '—'
  }

  function renderList(data) {
    const { estudiantes } = data
    const count = estudiantes.length

    const summary = h('p', {
      class: 'estudiantes__count',
      text: `${fmt.format(count)} estudiante${count === 1 ? '' : 's'}`,
    })

    if (count === 0) {
      results.replaceChildren(
        summary,
        h('div', { class: 'estudiantes__empty' }, [
          h('p', { text: 'No se encontraron estudiantes.' }),
          h('p', { text: 'Prueba con otra búsqueda o deja los filtros en "Todos".' }),
        ]),
      )
      return
    }

    const table = h('div', { class: 'estudiantes__table-wrap' }, [
      h('table', { class: 'estudiantes__table' }, [
        h('thead', {}, [
          h('tr', {}, [
            h('th', { scope: 'col', text: 'Estudiante' }),
            h('th', { scope: 'col', text: 'Cédula' }),
            h('th', { scope: 'col', text: 'Sexo' }),
            h('th', { scope: 'col', text: 'Teléfono' }),
            h('th', { scope: 'col', text: 'Año' }),
            h('th', { scope: 'col', text: 'Sección' }),
            h('th', { scope: 'col', text: 'Año escolar' }),
          ]),
        ]),
        h('tbody', {},
          estudiantes.map((student) =>
            h('tr', { class: 'estudiantes__row', dataset: { id: student.id } }, [
              h('td', {
                class: 'estudiantes__name',
                text: `${student.primer_nombre} ${student.primer_apellido}`,
              }),
              h('td', { class: 'estudiantes__ci', text: ciText(student) }),
              h('td', {}, [h('span', { class: 'badge', text: sexoLabel(student.sexo) })]),
              h('td', { text: student.telefono || '—' }),
              h('td', { text: student.anio || '—' }),
              h('td', { text: student.seccion || '—' }),
              h('td', { text: student.anio_escolar || '—' }),
            ]),
          ),
        ),
      ]),
    ])

    results.replaceChildren(summary, table)
  }

  function renderError(error) {
    const message = error && error.message ? error.message : 'No se pudieron cargar los estudiantes.'
    results.replaceChildren(
      h('div', { class: 'estudiantes__error' }, [
        h('p', { text: message }),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: load } }, [
          h('span', { text: 'Reintentar' }),
        ]),
      ]),
    )
  }

  function renderFiltersError(error) {
    const message = error && error.message ? error.message : 'No se pudieron cargar los filtros.'
    results.replaceChildren(
      h('div', { class: 'estudiantes__error' }, [
        h('p', { text: message }),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: loadFilters } }, [
          h('span', { text: 'Reintentar' }),
        ]),
      ]),
    )
  }

  function load() {
    const id = ++seq
    results.replaceChildren(h('p', { class: 'estudiantes__status', text: 'Cargando estudiantes…' }))
    api
      .estudiantes({ q: qInput.value, anio: anioSelect.value, seccion: seccionSelect.value })
      .then((data) => {
        if (id === seq) renderList(data)
      })
      .catch((error) => {
        if (id === seq) renderError(error)
      })
  }

  // Bound once: search and filter changes re-query but must not stack handlers.
  let searchTimer = null
  qInput.addEventListener('input', () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(load, 300)
  })

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

  /** @param {{ years: Array<{ label: string, sections: string[] }> }} academic */
  function fillFilters(academic) {
    options = academic
    const years = options.years ?? []

    anioSelect.replaceChildren(
      h('option', { value: '', text: 'Todos los años' }),
      ...years.map((year) => h('option', { value: year.label, text: year.label })),
    )
    anioSelect.disabled = false
    anioSelect.value = ''

    fillSections(collectSections(years))
    seccionSelect.value = ''
    seccionSelect.disabled = false

    load()
  }

  function loadFilters() {
    api
      .opciones()
      .then(fillFilters)
      .catch(renderFiltersError)
  }

  loadFilters()
}