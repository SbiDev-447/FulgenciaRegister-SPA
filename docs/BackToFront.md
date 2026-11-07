# De atrás para adelante

Cómo funciona el backend, cómo funciona el frontend y dónde se encuentran. Este
documento sigue una petición desde el clic hasta MariaDB y de vuelta, y en el camino
explica cada capa. Si vas a tocar el código por primera vez, leelo en orden.

- Detalle de las tablas: [`usDataBase.md`](./usDataBase.md)
- Esquema dibujado: [`Mermaid.md`](./Mermaid.md)
- Qué cubren las pruebas: [`Tests.md`](./Tests.md)
- Decisiones que no se leen en el código: [`RelevantPoints.md`](./RelevantPoints.md)

---

## 0. El recorrido completo

Un solo proceso sirve las dos mitades: Express entrega el HTML, el CSS y el JS, y
también responde `/api/*`. Por eso la SPA y la API comparten origen, no hay CORS y la
cookie de sesión viaja sola.

```text
  NAVEGADOR                                      SERVIDOR (Node + Express)
  ─────────                                      ────────────────────────
  clic / submit
      │
      ▼
  vista (client/js/views/*.js)
      │  llama a api.estudiantes({ q, page })
      ▼
  cliente HTTP (client/js/api.js)
      │  fetch('/api/estudiantes?q=ana&page=2')
      │  credentials: 'same-origin'  ─── cookie fulgencia_token ──┐
      ▼                                                           │
  ───────────────────────── red ────────────────────────────────  │
                                                                  │
      ┌───────────────────────────────────────────────────────────┘
      ▼
  app.js  →  express.json + cookieParser
      │
      ├─ requireAuth (middlewares/auth.js)   lee cookie, verifica JWT,
      │                                      recarga el usuario en la base
      ▼
  router (modules/*/*.routes.js)  →  solo mapea método + ruta
      ▼
  controller (*.controller.js)    →  valida la forma, arma la respuesta HTTP
      ▼
  service (*.service.js)          →  reglas de negocio y consultas
      ▼
  db.tabla('estudiantes')         →  mysql-tab → dbtabla → mysql2
      ▼
  MariaDB  ──── filas ────┐
                          │
  ◄──── JSON { estudiantes, total, page, pageSize, pages } ◄────┘
      │
      ▼
  la vista vuelve a pintar su contenedor
```

---

## 1. Backend

### 1.1 Arranque: dos decisiones que conviene ver

`server/src/index.js` hace exactamente dos cosas antes de escuchar:

```js
const results = await db.createAllTables()      // 1. el esquema, primero
...
const app = createApp()                          // 2. recién después, HTTP
app.listen(port, ...)
```

1. **Crea las tablas que falten antes de aceptar tráfico**, y si alguna falla el
   proceso muere (`process.exit(1)`). No hay migraciones: el esquema son los modelos de
   `server/model/` y `createAllTables()` los aplica a una base vacía. Una base que ya
   existe **no** se modifica (ver `usDataBase.md` §8).
2. **Valida el entorno al importar la configuración** (`config/env.js`). Si falta una
   variable obligatoria, el error nombra cuáles y el servidor no arranca. Preferible
   fallar en el arranque que a la primera consulta.

El `.env` vive en la raíz y lo lee Node con `--env-file-if-exists=../.env` (está en los
scripts de `server/package.json`), sin librerías de dotenv.

### 1.2 `app.js`: el orden importa

```js
app.use(express.json())          // cuerpo JSON
app.use(cookieParser())          // req.cookies
app.get('/api/health', ...)      // sin autenticación
app.get('/api/academico/opciones', ...)
app.use('/api/auth', authRoutes)
app.use('/api/estudiantes', estudianteRoutes)
app.use('/api/documentos', documentosRoutes)
app.use('/api/estadisticas', estadisticasRoutes)
app.use('/api/reportes', reportesRoutes)
app.use('/api/ajustes', ajustesRoutes)
app.use(express.static(clientDir))   // la SPA: HTML, CSS, JS, assets
app.use('/api', notFound)            // 404 en JSON para la API
app.use(errorHandler)                // último: todo error cae acá
```

Consecuencias prácticas, todas observables:

- `GET /` y `/index.html` devuelven la SPA; cualquier ruta desconocida que **no** empiece
  con `/api` cae en el 404 por defecto de Express (HTML). Es inofensivo porque el
  enrutado de la SPA es por hash: el servidor solo ve `/`.
- Una ruta desconocida **dentro** de `/api` sí devuelve el sobre JSON
  `{ code: 'not_found', message: 'Route not found: GET /api/nada' }`.
- La API no tiene CORS a propósito: cliente y API son el mismo origen.

### 1.3 Las capas, y por qué no hay una más

| Capa | Archivo | Responsabilidad | Lo que **no** hace |
| ---- | ------- | --------------- | ------------------ |
| Rutas | `modules/x/x.routes.js` | Mapear método + ruta, montar `requireAuth` | Nada de lógica |
| Controlador | `modules/x/x.controller.js` | Leer `req`, validar forma, elegir status, llamar al servicio | Nada de SQL |
| Servicio | `modules/x/x.service.js` | Reglas de negocio, transacciones, consultas | Nada de `req`/`res` |
| Acceso a datos | `config/db.js` → `db.tabla('x')` | Hablar con MariaDB | — |

**No hay capa de repositorios propia.** `mysql-tab` ya es esa capa, y envolverla en otra
abstracción solo agregaría un archivo que traduce nombres. Los módulos usan
`db.tabla('<tabla>')` directamente.

Esa decisión tiene un costo que hay que tener presente: **el SQL se arma en el servicio**.
Si algún día se interpola texto de usuario en un `where`, hay inyección. Hoy la defensa
está en la validación del controlador y en el escapado de la librería, no en placeholders.

### 1.4 El esquema y el acceso a datos

```js
// config/db.js
const db = new MySQL(config)
for (const model of models) db.addModel(model)
module.exports = db
```

Un único objeto exportado, con los siete modelos registrados. Sobre `db` hay cinco
métodos: `tabla`, `query`, `createAllTables`, `addModel`, `end`. Todo lo demás
(`select`, `paginate`, `insert`, `update`, `delete`, …) vive en lo que devuelve
`db.tabla('x')`. La tabla de métodos y sus trampas está en `usDataBase.md` §2.2.

### 1.5 Los seis módulos

**`auth`** — login, sesión, cierre.

- El cliente **nunca manda la contraseña**: manda `SHA-256(password)` en hex.
- El servidor guarda `scrypt(SHA-256(password))` con una sal por usuario y compara con
  `password.verify`.
- `checkCredentials` ejecuta el KDF **siempre**, incluso cuando el usuario no existe
  (usa una sal/hash ficticios). Así el tiempo de respuesta no delata si un usuario existe.
- Un fallo de credenciales responde un único 401 genérico, sin decir cuál de los dos
  datos estaba mal.

**`estudiantes`** — el módulo grande.

- `list` pagina y busca en SQL (ver §3.3): devuelve un resumen, no la ficha.
- `getFullRecord` es el ensamblador: estudiante + inscripciones (cada una con su
  checklist de recaudos) + representantes (con el `parentesco` pegado desde el puente).
  Son cuatro consultas y dos `Map` para unir en memoria, en lugar de un `JOIN` con filas
  repetidas.
- `createEstudiante` y `updateEstudiante` son **transaccionales**: estudiante →
  inscripción → documentos consignados → vínculos con representantes, y si algo falla se
  revierte todo. En el código está anotado el límite real: la transacción usa una conexión
  global de la instancia, así que dos peticiones simultáneas la compartirían. Es aceptable
  para una aplicación de un solo operador, y **no se deben anidar transacciones**.
- La cédula es **inmutable** después de crear la ficha: si el `PUT` trae otro par
  `tipo_ci`/`numero_ci`, es 400.
- El `DELETE` borra en cascada lo que cuelga del estudiante y además **barre los
  representantes que quedaron sin ningún estudiante**, en la misma transacción.

**`documentos`** — verificar y emitir.

- `verificar(cedula)` acepta el formato humano (`V-12345678`), lo normaliza, y devuelve
  `{ estudiante: <resumen> }` o 404 si no existe.
- `emitir({ tipo, estudiante_id, usuario_id })` **registra** la emisión en
  `documentos_emitidos` (con quién la emitió) y devuelve el documento más el resumen del
  estudiante con el que se rellena la carta. El servidor no genera el PDF: entrega datos.
- Los cuatro tipos viven en `constants/documentos.js` (slug en inglés, etiqueta en
  español): `carta_aceptacion`, `constancia_conducta`, `constancia_retiro`,
  `constancia_estudio`.

**`estadisticas`** — solo lectura, con filtros opcionales por año y sección. Devuelve
totales por sexo, una fila por año académico y el conteo de documentos emitidos.

**`reportes`** — solo lectura, para imprimir. `GET /api/reportes/seccion` exige año y
sección, resuelve el año escolar **más reciente** con inscripciones en ese grupo y
devuelve la lista completa sin paginar (una hoja impresa no tiene botón "siguiente"):
N°, apellidos y nombres, cédula, sexo, teléfono y correo. Elegir un solo año escolar
evita que un estudiante que repitió el mismo año aparezca dos veces o que se mezclen dos
cohortes en la misma hoja; `anio_escolar` permite fijar uno anterior.

**`ajustes`** — lo institucional y el mantenimiento.

- Guarda **en archivos, no en la base**, dos cosas que no son de ningún estudiante y no
  son historia: el director que firma y el logo del Ministerio. Viven en `data/`
  (`ajustes.json` y `logo-ministerio.<ext>`), una carpeta de la instalación gitignoreada
  porque lleva el nombre y la cédula de una persona. Van al servidor y no al navegador
  porque la carta se imprime desde cualquier equipo de la escuela.
- **Por qué archivos y no filas**: no son registro ni historia, son el membrete. Se
  escriben una vez y se quedan hasta que alguien los cambie; se inspeccionan con un
  editor cuando algo no cuadra; y no obligan a que un `dbtabla` transporte bytes. El
  respaldo copia `data/` en `backups/<mismo-nombre>.datos/` junto al `.sql`, y
  `pnpm db:restore` la devuelve con él — un respaldo que trae los estudiantes y olvida
  quién firma las cartas no es un respaldo de esta aplicación.
- **Se escribe con un temporal y un `rename`**: el `rename` es atómico en el mismo
  sistema de archivos, así que un corte a mitad deja la configuración anterior intacta
  en lugar de un JSON a medias. El logo se guarda con su extensión real y el anterior se
  borra: dos imágenes servidas a la vez es una que no se puede explicar.
- El `PUT` del logo acepta el **cuerpo binario** crudo en lugar de un JSON: el parser
  global de Express corta en 100 KB y abrirlo para toda la API sería una puerta más
  grande que este filtro. Sin `multer` ni `sharp`: no hay procesamiento, sólo el tope de
  2 MB, la firma de bytes y el archivo tal como llegó.
- Valida y canonicaliza del lado del servidor aunque el formulario ya avise: cédula
  (`V-12345678`), **nombre en mayúsculas** —una carta se firma así, y el formulario no
  decide tipografía—, cargo entre `Director`/`Directora`, imagen PNG/JPEG/WebP de hasta
  2 MB comprobada **por firma de bytes**, no por el `Content-Type` declarado.
- Reutiliza lo que ya existía: la purga llama a `purgeOrphanRepresentantes` del script de
  consola (la condición va dentro del `DELETE`) y el respaldo llama a la misma función
  que `pnpm db:dump`. No hay una segunda implementación de ninguna de las dos reglas.
- `requireAdmin` protege las escrituras y las dos operaciones; leer los ajustes pide
  sesión y nada más, porque el director se muestra en la pantalla a cualquier usuario.

### 1.6 Los errores tienen una sola forma

Todo error termina en `middlewares/error.js`, que responde siempre el mismo sobre:

```json
{ "code": "bad_request", "message": "...", "details": { "campo": "motivo" } }
```

| Situación | Status | `code` |
| --------- | ------ | ------ |
| Datos inválidos del formulario | 400 | `bad_request` |
| Sin cookie, token vencido o usuario borrado | 401 | `unauthorized` |
| Ficha inexistente | 404 | `not_found` |
| Cédula duplicada (MySQL 1062) | 409 | `conflict` |
| Un valor no cabe en su columna | 400 | `bad_request` + campo |
| Cualquier otra cosa | 500 | `internal_error` |

Dos detalles deliberados:

- **`message` está en inglés** porque es para logs y herramientas. La interfaz nunca lo
  muestra: elige el texto en español a partir de `code` (§2.3). Un mensaje de error
  escrito para depurar no debería ser el que lee una secretaria.
- Un valor demasiado largo para una columna se traduce a **400 nombrando el campo**, no a
  un 500. El usuario puede corregirlo; el servidor no debería taparlo con "error
  inesperado".

### 1.7 Autenticación, paso a paso

```text
POST /api/auth/login  { usuario, password: <sha256 hex> }
        │
        ├─ usuario desconocido o hash que no coincide → 401 genérico
        └─ ok → JWT { sub, usuario, rol } firmado con JWT_SECRET (8 h)
                 se escribe en la cookie fulgencia_token (httpOnly, sameSite=strict,
                 path=/, maxAge 8 h, secure solo en producción)
                 respuesta: { usuario: { id, usuario, nombre, rol } }
```

`requireAuth` protege **todo** el router de estudiantes, documentos y estadísticas (en
cada módulo, `router.use(requireAuth)`). En cada petición: lee la cookie, verifica el
JWT y **vuelve a leer el usuario en la base**. Esa relectura es lo que hace que borrar un
usuario invalide su sesión al instante; no hay lista de revocación porque no hace falta.

`GET /api/auth/me` es lo que el cliente usa al arrancar para saber si hay sesión. `POST
/api/auth/logout` limpia la cookie (`maxAge` se elimina: hay que **vencerla**, no
sobrescribirla).

---

## 2. Frontend

### 2.1 Sin bundler, a propósito

`client/index.html` carga `<script type="module" src="./js/main.js">`, y los `import`
relativos hacen el resto. No hay build: lo que se edita es lo que corre, y el servidor
sirve esa carpeta tal cual. El costo es que hay que cuidar las rutas relativas; el
beneficio es que no existe un paso que pueda desincronizar fuente y bundle.

### 2.2 Arranque y decisión de ruta

```text
initTheme()          → aplica el tema guardado o el del sistema
loadSession()        → GET /api/auth/me (si falla, simplemente no hay sesión)
createRouter(...)    → escucha hashchange y llama a handleChange en cada cambio
```

`main.js` es el **único guardia de sesión**: no hay un `if` de autenticación repartido por
las vistas.

- Sin sesión: se fuerza `light`, se navega a `/login` y se pinta `renderLogin`. Ninguna
  otra ruta es alcanzable, ni escribiendo el hash a mano.
- Con sesión: se aplica el tema guardado, se monta el shell (una sola vez) y se pinta la
  vista de la ruta. `/login` redirige a `/`.
- Ruta desconocida: el shell queda montado y se pinta `notFound` dentro del contenido.

### 2.3 Router, shell y vistas

**Router** (`router.js`): enrutado por hash porque el servidor sirve un único
`index.html`. `normalizePath('#/estudiantes')` → `/estudiantes`; `go(path, { replace })`
usa `location.replace` cuando no querés entrada en el historial (login, logout).

**Shell** (`shell.js`): se monta una vez y devuelve `{ viewRoot, setActive, setTitle, ... }`.
El sidebar, el topbar, el usuario, el toggle de tema y el botón de cerrar sesión se pintan
ahí; las vistas **solo** pintan dentro de `viewRoot`. Por eso navegar no reconstruye el
marco ni pierde el estado del menú.

**Vistas** (`views/*.js`): todas siguen la misma forma.

```js
export function renderEstudiantes(container, options) {
  const results = h('div', { class: 'estudiantes__results' })   // 1. construir
  ...
  clear(container); container.append(view)                       // 2. montar
  function load({ resetPage }) { ... api.estudiantes(...) ... }  // 3. cargar
  load({})                                                        // 4. disparar
}
```

- `h(tag, props, children)` construye el DOM; `clear(container)` lo vacía. Nada de
  `innerHTML` con datos de la API.
- Se re-pinta **la parte afectada** (`results.replaceChildren(...)`), no la página.
- Cada vista que consulta la API lleva un contador `seq` y descarta la respuesta que llega
  tarde: si buscás "ana" y después "luis", la respuesta de "ana" no puede pisar a la de
  "luis".

### 2.4 `ui/` y `features/`

| Pieza | Qué hace |
| ----- | -------- |
| `ui/dom.js` | `h`, `clear`, `applyProps`. `disabled` se asigna como **propiedad**, no como atributo; `on: {}` registra listeners sin `addEventListener` suelto |
| `ui/icons.js` | SVG inline por nombre (`icon('eye')`), sin sprites externos |
| `ui/messages.js` | `errorCopy({ status, code }, fallback)` → texto en español por `code` |
| `ui/modal.js` | Diálogo de confirmación (borrado) |
| `ui/format.js` | Fechas `dd/mm/aaaa` y formato de contacto |
| `features/session.js` | Estado de usuario, `sha256Hex`, `login`, `logout`, `loadSession` |
| `features/theme.js` | `localStorage` + `prefers-color-scheme`, aplicado como `data-theme` |
| `features/inscripcion.js` | El wizard de 5 pasos (datos personales, datos físicos y salud, inscripción, representantes, recaudos) |

### 2.5 El cliente HTTP

`api.js` es la única puerta a la API.

- `credentials: 'same-origin'` en cada request: la cookie httpOnly viaja sin que el
  código la toque (no puede leerla, y no necesita hacerlo).
- Normaliza la respuesta: texto → JSON si hay, `null` si no.
- Si el status no es 2xx, construye un `ApiError` con `status`, `code` y `details`, y el
  texto en español sale de `errorCopy`. Un fallo de red es `status: 0`.
- Expone una función por endpoint: ningún path de la API se escribe a mano en una vista.

### 2.6 Cómo se imprimen los documentos

El servidor entrega **datos**, no un PDF. El navegador compone e imprime:

```text
1. api.emitirDocumento({ tipo, estudiante_id })   → registra la emisión y devuelve el resumen
2. fetch('./assets/skeletons/<archivo>.html')     → el esqueleto del documento
3. extractSheet(html)                             → solo el <main class="sheet">
4. letterValues({ estudiante, fecha, institucion }) → cada hueco con su valor
5. fillLetter(sheet, values)                      → reemplaza y escapa
6. sheetNode(html)                                → DOMParser + importNode
7. await img.decode()                             → espera los logos
8. window.print()                                 → la vista de impresión del navegador
```

Dos cosas que evitan bugs reales: los valores se **escapan** antes de entrar al HTML, y
las imágenes se esperan con `decode()` porque imprimir antes de que decodifiquen pinta el
texto alternativo en lugar del escudo. El CSS de impresión (`assets/skeletons/carta.css`)
está acotado a `.sheet`, así que no afecta al resto de la aplicación.

Antes de armar la hoja, la vista pide `GET /api/ajustes`: el nombre y la cédula del
director salen de ahí (no de `institution.js`, que queda como respaldo cuando nadie
configuró nada) y, si hay un logo subido, `extractSheet(html, { logoUrl })` cambia el
`<img src="./LogoMinisterio-To-Left.webp">` de los cuatro esqueletos por el de la base.
Si esa llamada falla, la carta se emite igual con el placeholder: un ajuste caído no
puede impedir que la escuela entregue un documento.

### 2.7 Cómo se imprime la lista de una sección

La vista `Reportes` no reutiliza los esqueletos de las cartas: arma una hoja propia.

```text
1. api.reporteSeccion({ anio, seccion })  → lista completa del grupo (sin paginar)
2. buildSheet(data)                        → <main class="roster-sheet"> con la tabla
3. printArea.replaceChildren(sheet)        → nodo real, no innerHTML
4. await img.decode()                      → espera el escudo
5. window.print()                          → vista de impresión del navegador
```

El CSS de impresión vive en `styles/views/reportes.css`, no en la hoja: oculta todo con
`visibility: hidden` y deja visible solo `.reportes__print`. La tabla usa líneas de
**1px** hacia adentro y 2px afuera porque a resolución de impresión un borde de 0.6pt se
antialiasea y las columnas pierden el separador. El `thead` se repite en cada página y
las filas no se cortan al medio (`break-inside: avoid`).

### 2.8 Cómo se imprime una ficha

La ficha vive en un modal, pero no se imprime el modal: el botón "Imprimir ficha"
construye una hoja aparte en `.ficha-print` (dentro de la vista, fuera del diálogo).

```text
1. GET /api/estudiantes/:id              → el registro completo que ya cargó el modal
2. buildFichaSheet(record)               → membrete + datos agrupados + inscripciones + representantes
3. printArea.replaceChildren(sheet)      → nodo real, no innerHTML
4. await img.decode()                    → espera el escudo
5. window.print()                        → vista de impresión del navegador
```

El botón queda deshabilitado hasta que el registro llega, para que un clic rápido no
imprima una hoja vacía. Los datos personales se agrupan en **Datos personales** (cédula,
sexo, fecha y lugar de nacimiento), **Contacto** (teléfono, correo, dirección) y **Datos
físicos y salud** (talla, peso, uniforme, alergias, enfermedades); los campos vacíos no
se imprimen. Las inscripciones repiten la fecha en `dd/mm/aaaa`, el estado (regular o
repite) y los documentos consignados en una línea; los representantes llevan parentesco,
cédula, teléfono y correo. Misma regla que los documentos: el servidor entrega datos, el
navegador compone.

---

## 3. Cómo se conectan

### 3.1 El contrato, en una tabla

| Aspecto | Regla |
| ------- | ----- |
| Origen | Uno solo: Express sirve la SPA y la API. Sin CORS |
| Sesión | Cookie `fulgencia_token` httpOnly; el JS nunca la lee |
| Cuerpo | JSON en los pedidos con cuerpo; el logo es la excepción y viaja como cuerpo binario. El servidor responde siempre JSON en `/api`, salvo la imagen |
| Errores | `{ code, message, details }`; el cliente traduce por `code` |
| Fechas | La API entrega ISO (`YYYY-MM-DD`); la interfaz muestra `dd/mm/aaaa` |
| Cédula | Guardada como `tipo_ci` + `numero_ci`; viaja como `V-12345678` en URLs y cartas |
| Nombres | Las columnas de la base llegan al cliente con el mismo nombre (snake_case). No hay capa de DTO salvo `toPublicUser` y el resumen de documentos |
| Validación | Autoritativa en el servidor (`constants/` + validadores del módulo); la interfaz repite lo mínimo para no hacer esperar a nadie |

### 3.2 El saludo inicial

```text
SPA arranca ──GET /api/auth/me──► 401 sin cookie ──► pantalla de login
                                  200 con usuario ──► shell + ruta pedida

login: form ──SHA-256──► POST /api/auth/login ──► Set-Cookie ──► estado en memoria
                                                  (features/session.js)

cada request ──cookie──► requireAuth ──JWT válido + fila existente──► req.user ──► servicio
```

Si la cookie vence a mitad de sesión, la petición devuelve 401 y la vista muestra el
mensaje de error que corresponde; no hay renovación silenciosa. Volver a entrar es
iniciar sesión de nuevo.

### 3.3 Un caso completo: buscar y emitir una constancia

| Paso | Dónde | Qué pasa |
| ---- | ----- | -------- |
| 1 | `views/estudiantes.js` | El form de búsqueda hace `load({ resetPage: true })` |
| 2 | `api.js` | `api.estudiantes({ q, anio, seccion, page })` → `GET /api/estudiantes?...` |
| 3 | `estudiantes.routes.js` | `requireAuth` valida la cookie; `controller.list` |
| 4 | `estudiantes.service.js` | Con `q` usa `busquedaPaginate` (puntaje por columna); sin `q`, `paginate`. Devuelve `{ estudiantes, total, page, pageSize, pages }` |
| 5 | `views/estudiantes.js` | `renderList` + `renderPager` con la página nueva |
| 6 | usuario abre la ficha | `api.estudiante(id)` → `GET /api/estudiantes/:id` → `getFullRecord`; se muestra en un modal (`ui/modal.js`) |
| 7 | va a Documentos | `api.verificarDocumento('V-12345678')` → normaliza, busca, `{ estudiante }` |
| 8 | elige un tipo | `api.emitirDocumento(...)` → se registra la emisión con `usuario_id` |
| 9 | `letter.js` | Rellena el esqueleto y `window.print()` |

El orden importa en el paso 8: **primero se registra, después se imprime**. Si la
impresión falla, la emisión ya quedó en la bitácora con fecha y autor.

---

## 4. Dónde tocar qué

| Quiero… | Archivo |
| ------- | ------- |
| Agregar un endpoint | `modules/<x>/<x>.routes.js` + controlador + servicio |
| Cambiar una regla de validación | `modules/estudiantes/estudiantes.validators.js` y/o el controlador |
| Agregar una columna | `server/model/<tabla>.model.js` + `ALTER TABLE` a mano (§8 de `usDataBase.md`) |
| Agregar un tipo de documento | `constants/documentos.js` + un esqueleto en `client/assets/skeletons/` |
| Cambiar años o secciones | `constants/academic.js` |
| Agregar una vista | `client/js/views/` + una línea en `routes.js` y en `NAV_ITEMS` de `shell.js` |
| Cambiar las columnas o el formato de la lista impresa | `client/js/views/reportes.js` (marcado y datos) + `client/styles/views/reportes.css` (pantalla e impresión) |
| Cambiar el director o el logo que se imprime | `client/js/views/ajustes.js` (formulario) → `PUT /api/ajustes/*` → `modules/ajustes/ajustes.service.js` |
| Agregar otro ajuste institucional | un campo nuevo en `data/ajustes.json` (`ajustes.almacen.js`) y su bloque en la vista; no hay migración ni tabla que tocar |
| Cambiar textos de error | `client/js/ui/messages.js` (el servidor sigue respondiendo en inglés) |
| Cambiar la carta impresa | `client/assets/skeletons/*.html` y `.css` (no toques `letter.js` salvo que cambien los huecos) |

---

## 5. Las pruebas como contrato

| Suite | Cómo corre | Qué prueba de verdad |
| ----- | ---------- | -------------------- |
| Servidor | `pnpm --filter @fulgencia/server test` | Los e2e levantan la app real en un puerto efímero (`listen(0)`) y le hablan por HTTP con `fetch`, contra la base real: login, cookie, CRUD, paginación, documentos, reportes. Si no hay `.env` o contenedor, se saltan |
| Cliente | `pnpm --filter @fulgencia/client test` | Cada vista se renderiza contra `client/test/dom-stub.mjs`, un DOM mínimo que implementa solo lo que las vistas usan. Verifica estructura y comportamiento, no estilos |

`pnpm test` en la raíz corre las dos. Lo que ninguna suite cubre es el resultado visual:
el layout y la impresión se validan a mano en el navegador.
