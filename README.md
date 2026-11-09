![Banner](./files/Banner.webp)

# FULGENCIA REGISTER - SPA

**SPA de registro e inscripción estudiantil** para el Liceo Fulgencia Jiménez de Olmos. Administra los datos de los estudiantes al momento de inscribirlos —la ficha permanente, los representantes y los recaudos consignados en una sola base MariaDB— y automatiza la expedición de constancias y cartas, que se arman con esos mismos datos y se imprimen desde el navegador.

> Interfaz en JavaScript vanilla sin recarga de página, API REST en Express y base de datos MariaDB en Docker.

## 👥 Integrantes

- Sebastian Briceño **C.I.:** 32.117.825
- Claudia Montilla **C.I.:** 33.711.807
- Ruthmar Verbel **C.I.:** 32.346.703

## Estado del proyecto

| Componente | Estado |
| ---------- | ------ |
| Backend (API REST) | Listo — 142 pruebas (141 en verde, 1 saltada sin base) |
| Base de datos (MariaDB) | Listo — esquema y datos semilla |
| Frontend (SPA) | Listo — 98 pruebas en verde |

El backend está completo y cubierto por pruebas. En la SPA funcionan el shell, el router,
los temas y las seis vistas: Inicio (estadísticas), Estudiantes (lista paginada,
búsqueda, ficha —también imprimible—, edición y borrado con confirmación), Nueva
inscripción, Documentos (verificación por cédula y los cuatro documentos imprimibles),
Reportes (lista de asistencia por sección) y Ajustes (director que firma, logo del
Ministerio y mantenimiento de la base). La sección "Alcance" describe el alcance
funcional, no trabajo pendiente.

## Alcance

- **Inicio:** estadísticas de inscripción — total de estudiantes, distribución por sexo
  y por año, documentos emitidos. Filtro por año académico y sección.
- **Estudiantes:** CRUD de inscripción con ficha permanente (datos personales,
  inscripción, representantes y documentos consignados), que se puede imprimir desde el
  modal. Búsqueda por nombre o cédula.
- **Documentos:** verificación por cédula y emisión de cuatro documentos imprimibles
  (carta de aceptación, constancia de conducta, constancia de retiro, constancia de estudio).
- **Reportes:** lista de asistencia imprimible de una sección completa, por año y sección
  (apellidos y nombres, cédula, sexo, teléfono y correo).
- **Ajustes:** director o directora que firma los documentos, logo del Ministerio que
  encabeza la carta, y dos tareas de mantenimiento desde la interfaz: borrar los
  representantes huérfanos y escribir un respaldo de la base en `backups/`. Sólo el rol
  `admin` puede cambiarlos.
- **Autenticación:** inicio de sesión con contraseña cifrada y sesión mediante JWT.

## Stack

- **Frontend:** JavaScript vanilla (ESM, sin bundler), CSS con design tokens y
  `@font-face`, temas claro/oscuro. Tipografías locales.
- **Backend:** Node.js + Express 5, con `mysql-tab` y `tabla-model` para el acceso a datos.
- **Base de datos:** MariaDB 11 sobre Docker.
- **Autenticación:** SHA-256 en el cliente + scrypt en el servidor; JWT en cookie HttpOnly.
- **Herramientas:** pnpm (paquetes) y nvm (Node.js 24+).

## Estructura

```text
fulgenciaProject/
├── client/                  # SPA vanilla JS
│   ├── index.html
│   ├── assets/              # tipografías, imágenes y el esqueleto de las cartas
│   ├── styles/              # tokens.css, reset.css, layout.css, views/
│   ├── js/                  # main.js, routes.js, router.js, shell.js, api.js
│   │   ├── views/           # una vista por ruta (login, inicio, estudiantes, ...)
│   │   ├── features/        # sesión, tema e inscripción (el wizard de 5 pasos)
│   │   └── ui/              # helpers DOM (h, clear, svgIcon), iconos, modal, copy de errores y formato de contacto
│   └── test/                # pruebas del cliente (node:test, sin navegador)
├── server/                  # API REST (Express + mysql-tab)
│   ├── src/
│   │   ├── config/          # variables de entorno y pool de MariaDB
│   │   ├── modules/         # auth, estudiantes, documentos, estadisticas, reportes, ajustes
│   │   ├── middlewares/     # auth (incluye el guardia de rol), error
│   │   ├── constants/       # academico, auth, documentos
│   │   └── utils/           # cedula, password, jwt, httpError
│   ├── model/               # modelos tabla-model (el esquema)
│   ├── db/                  # seed, seed demo, dump, restore, purga y reparación
│   └── test/                # pruebas del servidor (node:test)
├── data/                    # director y logo configurados (gitignoreado, datos reales)
├── docs/                    # documentación del proyecto
│   ├── BackToFront.md       # el recorrido de una petición: backend, frontend y su enlace
│   ├── Informe.md           # qué es el proyecto y qué problema resuelve
│   ├── Mermaid.md           # esquema de la base en Mermaid
│   ├── MermaidFulgencia.pdf # el mismo esquema, exportado a PDF
│   ├── RelevantPoints.md    # notas técnicas de las decisiones no obvias
│   ├── Tests.md             # qué cubren las pruebas y qué no
│   └── usDataBase.md        # guía de estudio de la base de datos
├── files/                   # recursos del repositorio (banner)
├── backups/                 # respaldos locales (en .gitignore: llevan datos reales)
├── docker-compose.yml       # MariaDB 11
└── package.json             # scripts raíz
```

## Requisitos

- Node.js 24 o superior (recomendado con `nvm`).
- pnpm 11.
- Docker (para la base de datos).

## Puesta en marcha

```bash
# 1. Variables de entorno
cp .env.example .env   # completa los valores (ver tabla abajo)

# 2. Base de datos
pnpm db:up             # levanta MariaDB en el puerto 3306
pnpm db:seed           # crea las tablas y el usuario administrador

# 3. API en modo desarrollo
pnpm dev               # http://localhost:3000
```

El seed crea el usuario administrador `admin` / `admin123` para desarrollo.
Cámbialo antes de cualquier despliegue.

Para detener la base de datos usa `pnpm db:down`. Para recrearla desde cero usa
`pnpm db:reset && pnpm db:seed` — ojo: `db:reset` hace `docker compose down -v`, así que
**borra el volumen con todos los datos**. Si hay algo que conservar, `pnpm db:dump` antes
(ver [Respaldos](#respaldos-y-mover-el-proyecto-a-otro-equipo)).

### Variables de entorno

Obligatorias:

| Variable | Descripción |
| -------- | ----------- |
| `DB_HOST` | Host de MariaDB |
| `DB_PORT` | Puerto de MariaDB |
| `DB_USER` | Usuario de la base de datos |
| `DB_PASSWORD` | Contraseña de la base de datos |
| `DB_NAME` | Nombre de la base de datos |
| `JWT_SECRET` | Clave para firmar los JWT |

Opcionales: `PORT` (`3000` por defecto), `JWT_EXPIRES_IN` (`8h` por defecto) y
`NODE_ENV` (`development` por defecto).

## API

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| GET | `/api/health` | Estado del servicio |
| GET | `/api/academico/opciones` | Años y secciones válidos |
| POST | `/api/auth/login` | Iniciar sesión |
| GET | `/api/auth/me` | Usuario autenticado |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/estudiantes` | Listar y buscar estudiantes |
| POST | `/api/estudiantes` | Registrar estudiante |
| GET | `/api/estudiantes/:id` | Ver estudiante |
| PUT | `/api/estudiantes/:id` | Editar estudiante |
| POST | `/api/estudiantes/:id/inscripciones` | Inscribir a un estudiante ya registrado en un nuevo año escolar |
| DELETE | `/api/estudiantes/:id` | Eliminar estudiante (y los representantes que se queden sin ninguno) |
| GET | `/api/documentos/verificar/:cedula` | Verificar una cédula |
| POST | `/api/documentos/emitir` | Emitir un documento |
| GET | `/api/estadisticas` | Estadísticas de inscripción |
| GET | `/api/reportes/seccion` | Lista completa de estudiantes de una sección (`anio`, `seccion`, `anio_escolar` opcional) |
| GET | `/api/ajustes` | Director configurado y metadatos del logo |
| PUT | `/api/ajustes/director` | Guardar el director que firma (sólo `admin`) |
| GET | `/api/ajustes/logo` | El logo del Ministerio guardado |
| PUT | `/api/ajustes/logo` | Reemplazar el logo (cuerpo binario, máx. 2 MB, sólo `admin`) |
| GET | `/api/ajustes/representantes-huerfanos` | Representantes que ningún estudiante referencia (sólo `admin`) |
| POST | `/api/ajustes/purgar-representantes` | Borrarlos, revalidando en el `DELETE` (sólo `admin`) |
| POST | `/api/ajustes/backup` | Escribir un respaldo en `backups/` (sólo `admin`) |

### Inscribir un año nuevo

`POST /api/estudiantes/:id/inscripciones` agrega una inscripción a un estudiante que ya
existe, sin crear otra ficha ni tocar sus datos personales o su representante. El cuerpo
es `{ inscripcion, documentos? }`; `inscripcion` necesita al menos `anio_escolar`, `anio`,
`seccion` y `fecha_inscripcion`. Responde **201** con el expediente completo (el mismo
que `GET /api/estudiantes/:id`), **404** si el estudiante no existe, **400** si la
inscripción es inválida y **409** si ya hay una inscripción de ese estudiante para el
mismo `anio_escolar`.

Si se omite `documentos`, la nueva inscripción hereda los seis recaudos de la
inscripción más reciente del estudiante; si se envía, cada campo debe ser booleano y se
guarda tal cual. La fila de `documentos_consignados` siempre existe, aunque no haya
inscripción anterior.

**Regla de representantes:** un estudiante tiene como máximo un representante. `POST
/api/estudiantes` exige exactamente uno y `PUT /api/estudiantes/:id` acepta cero (para
desvincular) o uno; cualquier arreglo con más de un representante responde **400**. La
relación en la base sigue siendo N:M, porque un mismo representante puede tener varios
alumnos a su cargo.

### El listado de estudiantes

`GET /api/estudiantes` pagina en el servidor; no devuelve el padrón entero.

| Parámetro | Por defecto | Qué hace |
| --------- | ----------- | -------- |
| `q` | — | Busca en nombres, apellidos y cédula, ordenando por relevancia |
| `anio` | — | Filtra por año (`1er Año`, `2do Año`, …) |
| `seccion` | — | Filtra por sección (`A`..`F` según el año) |
| `page` | `1` | Página pedida; si se pasa del final, devuelve la última |
| `pageSize` | `20` | Filas por página, con techo de `100` |

```json
{ "estudiantes": [ ... ], "total": 30, "page": 2, "pageSize": 20, "pages": 2 }
```

`total` es el total **con los filtros aplicados**, no el del padrón completo, y `pages`
nunca baja de `1`: una búsqueda sin resultados devuelve `total: 0` en lugar de un listado
vacío sin explicación.

### El reporte de sección

`GET /api/reportes/seccion` no pagina: una hoja impresa no tiene botón "siguiente".

| Parámetro | Obligatorio | Qué hace |
| --------- | ----------- | -------- |
| `anio` | sí | Año del grupo (`1er Año`, `2do Año`, …) |
| `seccion` | sí | Sección dentro de ese año (`A`..`F` según el año) |
| `anio_escolar` | no | Fija un año escolar anterior; sin él se usa el más reciente con estudiantes en el grupo |

Devuelve `{ filtros, total, estudiantes }`, ordenado por apellidos y con los datos que
imprime la lista: nombre completo, cédula, sexo, teléfono y correo. Elegir un solo año
escolar evita duplicar a quien repitió y mezclar dos cohortes en la misma hoja.

## Rutas de la SPA

El enrutado es por hash: todo ocurre en la misma página, sin recargas.

| Ruta | Vista |
| ---- | ----- |
| `#/` | Inicio — estadísticas de inscripción con filtros |
| `#/estudiantes` | Listado con búsqueda y filtros, ficha del estudiante (imprimible), y acciones Ver / Editar / Borrar |
| `#/inscripcion` | Wizard de inscripción en 5 pasos |
| `#/documentos` | Verificación por cédula y emisión de los cuatro documentos |
| `#/reportes` | Lista de asistencia de una sección completa, lista para imprimir |
| `#/ajustes` | Director que firma, logo del Ministerio y mantenimiento (huérfanos y respaldo) |

El wizard **no** tiene entrada en el menú lateral: se llega desde el botón "Nueva
inscripción" de Estudiantes y, como carga sus propias opciones académicas, un
enlace directo o una recarga funcionan igual.

## Documentación

| Documento | Para qué sirve |
| --------- | -------------- |
| [`docs/BackToFront.md`](./docs/BackToFront.md) | Cómo funciona el backend, cómo funciona el frontend y cómo se conectan, siguiendo una petición de punta a punta |
| [`docs/Informe.md`](./docs/Informe.md) | Qué es el proyecto, por qué existe y qué problema resuelve, en un párrafo |
| [`docs/Mermaid.md`](./docs/Mermaid.md) | Esquema de la base en Mermaid, con cardinalidades y reglas de borrado |
| [`docs/MermaidFulgencia.pdf`](./docs/MermaidFulgencia.pdf) | El mismo esquema exportado a PDF, para imprimir o adjuntar |
| [`docs/usDataBase.md`](./docs/usDataBase.md) | Guía de estudio de la base: diccionario de datos, trampas del esquema y recetas SQL |
| [`docs/RelevantPoints.md`](./docs/RelevantPoints.md) | Notas técnicas de las decisiones que no se leen en el código |
| [`docs/Tests.md`](./docs/Tests.md) | Qué cubren las pruebas, cómo correrlas y qué queda fuera de su alcance |

## Scripts

| Comando | Acción |
| ------- | ------ |
| `pnpm dev` | API en modo desarrollo (con recarga) |
| `pnpm start` | API en modo producción |
| `pnpm db:up` / `pnpm db:down` | Levantar / detener MariaDB |
| `pnpm db:reset` | Recrear la base de datos (borra los datos) |
| `pnpm db:seed` | Crear tablas y datos semilla |
| `pnpm db:demo` | Llenar la base con 30 estudiantes de demostración (borra los datos de personas, conserva los usuarios) |
| `pnpm db:purge-orphans` | Borrar representantes que quedaron sin ningún estudiante (lo mismo que el botón de Ajustes) |
| `pnpm db:repair-schema` | Ensanchar columnas que quedaron demasiado pequeñas (ver abajo) |
| `pnpm db:dump` | Guardar una copia de la base de datos en `backups/` (o el botón de Ajustes) |
| `pnpm db:restore` | Devolver una copia: sin `--apply` solo dice qué haría (ver abajo) |
| `pnpm test` | Ejecutar todas las pruebas (servidor y cliente) |

### Respaldos y mover el proyecto a otro equipo

La carpeta del proyecto lleva la **receta** de la base de datos —`docker-compose.yml`, los
modelos, el seed— y nunca su **contenido**. Copiar la carpeta a otro equipo da la aplicación
funcionando con una escuela vacía; para llevarse los datos hay que llevarse un respaldo.

```bash
pnpm db:dump                      # guarda backups/<base>-<fecha>.sql (+ <mismo>.datos/)
pnpm db:restore                   # dice qué haría con el respaldo más nuevo; no escribe
pnpm db:restore backups/x.sql --apply   # lo restaura de verdad
```

Un respaldo son **dos cosas**: el `.sql` con las tablas y una carpeta `<mismo-nombre>.datos/`
con el director y el logo que configuró la escuela. Esos dos no están en la base —viven en
`data/`, ver `docs/BackToFront.md`—, así que el volcado los copia al lado y `db:restore` los
devuelve en bloque. Un `.sql` sin su carpeta restaura a los estudiantes y deja las cartas sin
firmar: al mover el proyecto hay que llevarse las dos cosas.

`db:dump` corre `mariadb-dump` **dentro del contenedor**, con las credenciales y el nombre
de la base que el propio contenedor tiene (`MARIADB_*`, los de `docker-compose.yml`), no con
los de `.env`: el servicio que está corriendo es la fuente de verdad de lo que puede volcar,
y así el respaldo funciona en un equipo recién clonado, donde `.env` todavía no existe. Usa
`--single-transaction`, así que el volcado es una foto consistente: una fila escrita a mitad
del respaldo no puede quedar partida.

Un respaldo que falla **no deja archivo**. Si `mariadb-dump` corta a medio camino, el
comando borra el `.sql` y termina con error; si el archivo sale vacío o con un mensaje de
error en vez de tablas, también. Un archivo de 0 bytes en `backups/` es peor que no tener
respaldo: parece uno hasta el día que hace falta.

`db:restore` **no escribe sin `--apply`** — es el único comando del repositorio que puede
reemplazar todas las filas de un colegio, así que por defecto solo imprime lo que está en
juego: qué tablas trae el respaldo, y cuántas tablas y cuántos estudiantes hay ahora. Además
te dice cómo conservar lo de ahora antes de seguir (`pnpm db:dump`). Restaura las tablas que
el respaldo contiene y **no borra** las que no estén en él. Con `--database <nombre>` se
puede restaurar en otra base —para inspeccionar un respaldo sin tocar la real— y ese es
también el camino con el que se verificó que la restauración funciona sin arriesgar datos
reales: se volcó la base viva, se restauró en una base desechable y los `CHECKSUM TABLE` de
las siete tablas coincidieron con los de la base viva.

`backups/` está en `.gitignore`: **contiene datos reales de estudiantes y no se commitea.**

Para pasar el proyecto a otro equipo: `pnpm db:dump` en este, copiar el `.sql`, su carpeta
`.datos` y el `.env` (a mano, por un pendrive o donde corresponda), y en el otro `pnpm db:up
&& pnpm db:restore <archivo>.sql --apply`.

## Roadmap

- [x] Estructura del monorepo y base de datos
- [x] Autenticación (login, sesión, cierre)
- [x] API de estudiantes (CRUD y representantes)
- [x] API de documentos y estadísticas
- [x] Interfaz SPA (shell, router, temas)
- [x] Vistas de inicio y estudiantes (lista, ficha, edición, borrado y wizard de inscripción)
- [x] Vista de documentos
- [x] Generación e impresión de documentos
- [x] Reportes: lista de asistencia imprimible por sección
- [x] Vista de ajustes: director, logo del Ministerio y mantenimiento desde la interfaz
