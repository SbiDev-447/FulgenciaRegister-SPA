// Inicio view: statistics dashboard. Consumes /api/estadisticas with optional
// year/section filters sourced from /api/academico/opciones; shows KPI cards
// and a per-year distribution. Markup is built with h() and textContent only
// (AGENTS/docs/ARQUITECTURA.md §6: no innerHTML with data).

import { h, clear } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { api } from "../api.js";
import { errorCopy } from "../ui/messages.js";

const fmt = new Intl.NumberFormat("es-VE");

/**
 * @param {HTMLElement} container
 * @param {{ user?: object }} [context]
 */
export function renderInicio(container, { user } = {}) {
  const nombre = user?.nombre ?? user?.usuario ?? "";
  const bienvenida = nombre ? `Bienvenido, ${nombre}` : "Bienvenido";

  const anioSelect = h("select", {
    class: "inicio__select",
    "aria-label": "Filtrar por año",
    disabled: true,
  });
  const seccionSelect = h("select", {
    class: "inicio__select",
    "aria-label": "Filtrar por sección",
    disabled: true,
  });
  const clearBtn = h(
    "button",
    {
      class: "btn btn--ghost inicio__clear",
      type: "button",
      hidden: true,
      on: { click: clearFilters },
    },
    [h("span", { text: "Limpiar filtros" })],
  );
  const results = h("div", { class: "inicio__results" });

  const view = h("section", { class: "inicio" }, [
    h("div", { class: "inicio__hero" }, [
      h("h2", { text: bienvenida }),
      h("p", {
        text: "Las estadísticas, registros y documentos, cerca y a su disposición.",
      }),
    ]),
    h(
      "form",
      {
        class: "inicio__filtros",
        on: { submit: (event) => event.preventDefault() },
      },
      [
        h("label", { class: "inicio__field" }, [
          h("span", { text: "Año" }),
          anioSelect,
        ]),
        h("label", { class: "inicio__field" }, [
          h("span", { text: "Sección" }),
          seccionSelect,
        ]),
        clearBtn,
      ],
    ),
    results,
  ]);

  clear(container);
  container.append(view);

  // Incremented on every reload so a slow earlier response never overwrites a
  // newer one after the user changed filters.
  let seq = 0;

  function numeric(value) {
    return fmt.format(value);
  }

  function renderStats(data) {
    const {
      estudiantes,
      documentosEmitidos,
      porAnio = [],
      porSeccion = [],
      filtros,
      actualizadoEn,
    } = data;

    // The breakdown must answer the active filter instead of silently ignoring
    // it: with a year selected we show its sections; otherwise the cross-year
    // panorama.
    const bySection = Boolean(filtros?.anio);
    const rows = bySection ? porSeccion : porAnio;
    const rowKey = bySection ? "seccion" : "anio";

    const hasData =
      estudiantes.total > 0 ||
      documentosEmitidos > 0 ||
      rows.some((row) => row.total > 0);
    if (!hasData) {
      results.replaceChildren(renderEmptyState(filtros));
      return;
    }

    const filterActive = Boolean(filtros?.anio || filtros?.seccion);
    const share = (value) =>
      estudiantes.total > 0
        ? Math.round((value / estudiantes.total) * 100)
        : 0;

    const cards = [
      {
        label: "Estudiantes",
        value: estudiantes.total,
        tone: "total",
        hint: filterActive ? "en el filtro actual" : "en total",
      },
      {
        label: "Mujeres",
        value: estudiantes.mujeres,
        tone: "mujeres",
        hint: `${share(estudiantes.mujeres)}% del total`,
      },
      {
        label: "Hombres",
        value: estudiantes.hombres,
        tone: "hombres",
        hint: `${share(estudiantes.hombres)}% del total`,
      },
      {
        label: "Documentos emitidos",
        value: documentosEmitidos,
        tone: "documentos",
        hint: filterActive ? "histórico de los estudiantes filtrados" : "histórico total",
      },
    ];

    const maxTotal = Math.max(...rows.map((row) => row.total), 1);

    const legend = h("div", { class: "inicio__legend" }, [
      h("span", { class: "inicio__legend-item" }, [
        h("span", { class: "inicio__swatch inicio__swatch--mujeres", "aria-hidden": "true" }),
        h("span", { text: "Mujeres" }),
      ]),
      h("span", { class: "inicio__legend-item" }, [
        h("span", { class: "inicio__swatch inicio__swatch--hombres", "aria-hidden": "true" }),
        h("span", { text: "Hombres" }),
      ]),
    ]);

    const breakdown = h("article", { class: "card inicio__breakdown" }, [
      h("div", { class: "inicio__breakdown-head" }, [
        h("div", {}, [
          h("h3", {
            text: bySection
              ? `Distribución por sección · ${filtros.anio}`
              : "Distribución por año",
          }),
          h("p", {
            class: "inicio__breakdown-note",
            text: bySection
              ? "Inscripciones del año seleccionado, por sección."
              : "Todos los años; respeta el filtro de sección.",
          }),
        ]),
        legend,
      ]),
      h(
        "div",
        { class: "inicio__rows" },
        rows.map((row) => {
          const label = row[rowKey];
          const pct = Math.round((row.total / maxTotal) * 100);
          const selected = bySection && filtros.seccion === label;
          const mujeresPct = row.total > 0 ? (row.mujeres / row.total) * 100 : 0;
          const hombresPct = row.total > 0 ? (row.hombres / row.total) * 100 : 0;
          return h(
            "div",
            {
              class: selected ? "inicio__row is-selected" : "inicio__row",
              dataset: bySection ? { seccion: label } : { anio: label },
            },
            [
              h("span", { class: "inicio__row-label", text: label }),
              h("div", { class: "inicio__bar", "aria-hidden": "true" }, [
                row.total > 0
                  ? h(
                      "div",
                      {
                        class: "inicio__bar-total",
                        style: { width: `${Math.max(pct, 3)}%` },
                      },
                      [
                        mujeresPct > 0
                          ? h("span", {
                              class: "inicio__bar-fill inicio__bar-fill--mujeres",
                              style: { width: `${mujeresPct}%` },
                            })
                          : null,
                        hombresPct > 0
                          ? h("span", {
                              class: "inicio__bar-fill inicio__bar-fill--hombres",
                              style: { width: `${hombresPct}%` },
                            })
                          : null,
                      ],
                    )
                  : null,
              ]),
              h("span", {
                class: "inicio__row-total",
                text: numeric(row.total),
              }),
              h("span", {
                class: "inicio__row-split",
                text: `${numeric(row.mujeres)} M · ${numeric(row.hombres)} H`,
              }),
            ],
          );
        }),
      ),
    ]);

    clearBtn.hidden = !filterActive;

    const updated = timeLabel(actualizadoEn);

    results.replaceChildren(
      h(
        "div",
        { class: "inicio__stats" },
        cards.map((card) =>
          h("article", { class: `card inicio__kpi inicio__kpi--${card.tone}` }, [
            h("span", { class: "inicio__kpi-label" }, [
              h("span", { class: "inicio__kpi-dot", "aria-hidden": "true" }),
              h("span", { text: card.label }),
            ]),
            h("strong", {
              class: "inicio__kpi-value",
              text: numeric(card.value),
            }),
            card.hint
              ? h("span", { class: "inicio__kpi-hint", text: card.hint })
              : null,
          ]),
        ),
      ),
      breakdown,
      updated
        ? h("p", { class: "inicio__updated", text: `Actualizado a las ${updated}` })
        : null,
    );
  }

  function renderEmptyState(filtros) {
    const filterActive = Boolean(filtros?.anio || filtros?.seccion);
    const action = filterActive
      ? h(
          "button",
          {
            class: "btn btn--primary",
            type: "button",
            on: { click: clearFilters },
          },
          [h("span", { text: "Limpiar filtros" })],
        )
      : h("a", { class: "btn btn--primary", href: "#/inscripcion" }, [
          h("span", { text: "Registrar el primer estudiante" }),
        ]);

    return h("div", { class: "card inicio__empty" }, [
      h("span", { class: "inicio__empty-icon", "aria-hidden": "true" }, [
        icon("documentos", { width: "28", height: "28" }),
      ]),
      h("div", { class: "inicio__empty-copy" }, [
        h("p", {
          class: "inicio__empty-title",
          text: filterActive
            ? "No hay inscripciones que coincidan con los filtros seleccionados."
            : "Todavía no hay inscripciones registradas.",
        }),
        action,
      ]),
    ]);
  }

  function clearFilters() {
    anioSelect.value = "";
    fillSections(collectSections(options?.years ?? []));
    seccionSelect.value = "";
    load();
  }

  /** Local `HH:MM` for the aggregation timestamp, or null if unusable. */
  function timeLabel(iso) {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString("es-VE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderError(error) {
    const message = errorCopy(error, "No se pudieron cargar las estadísticas.");
    results.replaceChildren(
      h("div", { class: "inicio__error" }, [
        h("p", { text: message }),
        h(
          "button",
          { class: "btn btn--primary", type: "button", on: { click: load } },
          [h("span", { text: "Reintentar" })],
        ),
      ]),
    );
  }

  /** Skeleton placeholder while the aggregation travels; keeps layout stable. */
  function renderLoading() {
    const line = (variant) =>
      h("span", {
        class: `inicio__skeleton-line inicio__skeleton-line--${variant}`,
      });

    results.replaceChildren(
      h(
        "div",
        { class: "inicio__stats", "aria-hidden": "true" },
        Array.from({ length: 4 }, () =>
          h("article", { class: "card inicio__kpi inicio__skeleton" }, [
            line("label"),
            line("value"),
          ]),
        ),
      ),
      h(
        "article",
        {
          class: "card inicio__breakdown inicio__skeleton",
          "aria-hidden": "true",
        },
        [
          line("title"),
          h(
            "div",
            { class: "inicio__rows" },
            Array.from({ length: 4 }, () =>
              h("div", { class: "inicio__skeleton-row" }, [
                line("row-label"),
                line("row-bar"),
                line("row-total"),
              ]),
            ),
          ),
        ],
      ),
      h("p", {
        class: "inicio__status inicio__sr",
        role: "status",
        text: "Cargando estadísticas…",
      }),
    );
  }

  function load() {
    const id = ++seq;
    renderLoading();
    api
      .estadisticas({ anio: anioSelect.value, seccion: seccionSelect.value })
      .then((data) => {
        if (id === seq) renderStats(data);
      })
      .catch((error) => {
        if (id === seq) renderError(error);
      });
  }

  let options = null;

  // Bound once: retries re-fill the options but must not stack handlers.
  anioSelect.addEventListener("change", () => {
    const year = (options?.years ?? []).find(
      (entry) => entry.label === anioSelect.value,
    );
    const sections = year
      ? year.sections
      : collectSections(options?.years ?? []);
    fillSections(sections);
    if (!sections.includes(seccionSelect.value)) {
      seccionSelect.value = "";
    }
    load();
  });
  seccionSelect.addEventListener("change", load);

  /** @param {{ years: Array<{ label: string, sections: string[] }> }} academic */
  function fillFilters(academic) {
    options = academic;
    const years = options.years ?? [];

    const allSections = collectSections(years);

    anioSelect.replaceChildren(
      h("option", { value: "", text: "Todos los años" }),
      ...years.map((year) =>
        h("option", { value: year.label, text: year.label }),
      ),
    );
    anioSelect.disabled = false;
    anioSelect.value = "";

    fillSections(allSections);
    seccionSelect.value = "";
    seccionSelect.disabled = false;

    load();
  }

  /** Union of every section label across all years, in first-seen order. */
  function collectSections(years) {
    const sections = [];
    const seen = new Set();
    for (const year of years) {
      for (const section of year.sections) {
        if (!seen.has(section)) {
          seen.add(section);
          sections.push(section);
        }
      }
    }
    return sections;
  }

  function fillSections(sections) {
    seccionSelect.replaceChildren(
      h("option", { value: "", text: "Todas las secciones" }),
      ...sections.map((section) =>
        h("option", { value: section, text: section }),
      ),
    );
  }

  function renderFiltersError(error) {
    const message = errorCopy(error, "No se pudieron cargar los filtros.");
    results.replaceChildren(
      h("div", { class: "inicio__error" }, [
        h("p", { text: message }),
        h(
          "button",
          {
            class: "btn btn--primary",
            type: "button",
            on: { click: loadFilters },
          },
          [h("span", { text: "Reintentar" })],
        ),
      ]),
    );
  }

  function loadFilters() {
    api.opciones().then(fillFilters).catch(renderFiltersError);
  }

  loadFilters();
}
