// Inicio view: welcome panel and quick-access cards. Placeholder for the future
// statistics dashboard.

import { escapeHtml } from '../utils.js'

/**
 * @param {HTMLElement} container
 * @param {{ user?: object }} [context]
 */
export function renderInicio(container, { user } = {}) {
  const nombre = escapeHtml(user?.nombre ?? user?.usuario ?? '')

  container.innerHTML = `
    <section class="inicio">
      <div class="inicio__hero">
        <h2>Bienvenido${nombre ? `, ${nombre}` : ''}</h2>
        <p>
          Panel de gestión de la inscripción estudiantil del liceo. Desde aquí
          consultarás estudiantes, emitirás documentos y verás las estadísticas del
          período.
        </p>
      </div>

      <div class="inicio__grid">
        <article class="card inicio__card">
          <h3>Estudiantes</h3>
          <p>Listado, búsqueda por nombre o cédula, ficha e inscripción.</p>
          <a class="tag" href="#/estudiantes">En construcción</a>
        </article>

        <article class="card inicio__card">
          <h3>Documentos</h3>
          <p>Verificación por cédula y emisión de constancias imprimibles.</p>
          <a class="tag" href="#/documentos">En construcción</a>
        </article>

        <article class="card inicio__card">
          <h3>Estadísticas</h3>
          <p>Total de estudiantes, distribución por sexo y por año.</p>
          <span class="tag">En construcción</span>
        </article>
      </div>
    </section>
  `
}
