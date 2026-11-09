# Métodos, herramientas y librerías

Documento de referencia técnica del proyecto **Fulgencia Register**. Explica qué se usa, dónde se usa y por qué se eligió, sin repetir el detalle funcional que ya cubren el [README](../README.md) y los documentos de arquitectura.

## 1. Resumen de la decisión técnica

| Decisión | Elección | Motivo principal |
| -------- | -------- | ---------------- |
| Arquitectura | SPA + API REST | Separar la interfaz del acceso a datos y permitir que el mismo backend sirva la app y los documentos. |
| Frontend | JavaScript vanilla, ESM, sin bundler | El proyecto es pequeño; se evita toolchain, build y dependencias de runtime. |
| Backend | Node.js + Express 5 | HTTP explícito, middlewares simples y bajo costo de infraestructura. |
| Base de datos | MariaDB 11 en Docker | Datos relacionales, integridad referencial y un entorno reproducible. |
| Acceso a datos | `mysql-tab` + `tabla-model` | Repository layer y modelos declarativos sin ORM pesado. |
| Autenticación | JWT en cookie HttpOnly | Sesión sin estado en el servidor, cookie inaccesible desde JavaScript. |
| Contraseñas | SHA-256 en cliente + `scrypt` en servidor | El servidor nunca recibe la contraseña en claro y el hash almacenado es resistente a fuerza bruta. |
| Pruebas | `node:test` + DOM mínimo propio | Sin runner externo ni navegador; pruebas rápidas y deterministas. |

## 2. Librerías

### 2.1 Backend

| Librería | Versión | Dónde se usa | Cómo se usa | Por qué |
| -------- | ------- | ------------ | ----------- | ------- |
| `express` | `5.3.0` | `server/src/app.js`, rutas y middlewares | Define la app, monta routers por módulo, sirve la SPA estática y encadena middlewares. | Framework HTTP maduro y mínimo; Express 5 maneja promesas y errores asíncronos con menos código. |
| `cookie-parser` | `1.4.7` | `server/src/app.js`, `middlewares/auth.js` | Lee la cookie `fulgencia_token` y la expone en `req.cookies`. | El JWT viaja en cookie HttpOnly; el frontend no puede ni necesita leerla. |
| `jsonwebtoken` | `9.0.3` | `src/utils/jwt.js`, `src/modules/auth` | Firma el token al iniciar sesión y lo verifica en `requireAuth`. | Sesión stateless con expiración configurable (`JWT_EXPIRES_IN`). |
| `mysql-tab` | `2.1.4` | `src/config/db.js` y todos los servicios | Se instancia con la configuración de MariaDB y se usa como `db.tabla('nombre')` para consultar, insertar, actualizar y borrar. | Es la capa de repositorio del backend; evita envolver el acceso a datos en otra abstracción. |
| `tabla-model` | `2.0.6` | `server/model/*.model.js` | Declara columnas, tipos, claves primarias, únicas y relaciones de cada tabla. | Mantiene el esquema en código versionado y permite que `mysql-tab` resuelva dependencias. |

No hay ORM ni query builder adicional. Las consultas viven en los servicios y usan la API de `mysql-tab` directamente.

### 2.2 Frontend

El cliente **no tiene dependencias de runtime**. No hay React, Vue, Svelte, jQuery, bundler ni transpilador.

| Pieza nativa | Dónde se usa | Cómo se usa | Por qué |
| ------------ | ------------ | ----------- | ------- |
| `fetch` | `client/js/api.js`, `views/documentos.js` | Centraliza las llamadas a `/api` y descarga los esqueletos HTML de los documentos. | Es la API HTTP del navegador; no hace falta una librería para pocas peticiones. |
| Web Crypto (`crypto.subtle.digest`) | `client/js/api.js` | Calcula SHA-256 de la contraseña antes de enviarla. | El servidor nunca ve la contraseña en claro. |
| `localStorage` | `features/theme.js` | Persiste la preferencia de tema claro/oscuro. | Es una preferencia local, no un dato de negocio. |
| `matchMedia` | `features/theme.js`, `features/inscripcion.js` | Detecta tema del sistema y preferencia de movimiento reducido. | Respeta configuración del usuario sin librerías. |
| `DOMParser` | `views/documentos.js` | Extrae y clona el `<main class="sheet">` de los esqueletos HTML. | Permite imprimir documentos sin generar PDF en el servidor. |
| DOM API | `ui/dom.js` y todas las vistas | `document.createElement`, `replaceChildren`, `append`, eventos. | El proyecto usa construcción de DOM, no `innerHTML` con datos. |
| CSS nativo | `client/styles` | Variables CSS, grid, flexbox, `@font-face`, media queries. | Diseño mantenible sin preprocesador ni framework CSS. |

### 2.3 Módulos nativos de Node.js

| Módulo | Dónde se usa | Uso | Por qué |
| ------ | ------------ | --- | ------- |
| `node:crypto` | `src/utils/password.js`, `db/seed.js` | `randomBytes`, `scryptSync`, `timingSafeEqual`. | Hash con sal y comparación en tiempo constante. |
| `node:fs` | `ajustes.almacen.js`, `db/dump.js`, `db/restore.js` | Lee y escribe configuración, logo y respaldos con operaciones síncronas controladas. | Los ajustes viven en archivos, no en la base. |
| `node:path` | `app.js`, `ajustes.almacen.js`, `db/*` | Resolver rutas seguras dentro de `data/` y `client/`. | Evita rutas relativas frágiles. |
| `node:child_process` | `db/backup.js`, `db/dump.js` | Ejecutar `mariadb-dump` dentro del contenedor. | Reutiliza la herramienta oficial de MariaDB. |
| `node:util` | `db/dump.js`, `db/restore.js` | `parseArgs` para las opciones de CLI. | Argumentos sin dependencias. |
| `node:test` y `node:assert` | `server/test`, `client/test` | Suites, subtests y aserciones. | Runner incluido en Node; cero dependencias de testing. |

## 3. Herramientas

| Herramienta | Versión / configuración | Uso | Por qué |
| ----------- | ----------------------- | --- | ------- |
| Node.js | `>=24`, fijado en `.nvmrc` | Runtime del servidor, scripts de base y pruebas. | `node:test`, `--watch` y `--env-file-if-exists` vienen incluidos. |
| pnpm | `11.25.0` (`packageManager`) | Workspace con `@fulgencia/server` y `@fulgencia/client`; scripts raíz con `--filter`. | Instalación rápida, lockfile reproducible y scripts por paquete. |
| Docker Compose | `docker-compose.yml` | Levanta MariaDB 11 con volumen y healthcheck. | Entorno de base reproducible y aislado del equipo. |
| MariaDB | 11 | Base de datos relacional. | Integridad referencial, claves compuestas y SQL maduro. |
| `mariadb-dump` | Dentro del contenedor | Respaldo de la base desde `pnpm db:dump`. | Herramienta oficial; no se reimplementa el volcado. |
| Git | — | Control de versiones y commits convencionales. | Historial revisable por cambio de comportamiento. |
| `node --test` | — | Pruebas de servidor y cliente. | No requiere Jest, Vitest ni navegador. |
| `dom-stub.mjs` | `client/test/dom-stub.mjs` | DOM mínimo para renderizar vistas en Node. | Prueba rutas de render sin jsdom y sin costo de navegador. |

### Scripts raíz relevantes

| Script | Qué hace |
| ------ | -------- |
| `pnpm dev` | Servidor en modo watch. |
| `pnpm start` | Servidor en modo normal. |
| `pnpm test` | Ejecuta las pruebas de todos los paquetes. |
| `pnpm db:up` / `db:down` / `db:reset` | Ciclo de vida del contenedor MariaDB. |
| `pnpm db:seed` / `db:demo` | Datos mínimos o datos de demostración. |
| `pnpm db:purge-orphans` | Auditoría/borrado de representantes sin estudiantes. |
| `pnpm db:dump` / `db:restore` | Respaldo y restauración de base + `data/`. |
| `pnpm db:repair-schema` | Reparación puntual del esquema. |

## 4. Métodos HTTP

Todas las rutas viven bajo `/api`. Salvo `health`, `academico` y `auth/login`, requieren cookie de sesión válida.

| Método | Ruta | Autenticación | Qué hace |
| ------ | ---- | ------------- | -------- |
| `GET` | `/api/health` | Pública | Estado del servicio. |
| `GET` | `/api/academico/opciones` | Pública | Años y secciones válidos. |
| `POST` | `/api/auth/login` | Pública | Valida credenciales y emite la cookie JWT. |
| `GET` | `/api/auth/me` | Sesión | Devuelve el usuario autenticado. |
| `POST` | `/api/auth/logout` | Sesión | Borra la cookie de sesión. |
| `GET` | `/api/estudiantes` | Sesión | Lista paginada con búsqueda y filtros. |
| `POST` | `/api/estudiantes` | Sesión | Crea estudiante, inscripción, documentos y representante en una transacción. |
| `GET` | `/api/estudiantes/:id` | Sesión | Devuelve la ficha completa. |
| `PUT` | `/api/estudiantes/:id` | Sesión | Edita datos del estudiante y su representante; la cédula es inmutable. |
| `POST` | `/api/estudiantes/:id/inscripciones` | Sesión | Inscribe a un estudiante existente en un nuevo año escolar. |
| `DELETE` | `/api/estudiantes/:id` | Sesión | Borra al estudiante y limpia representantes huérfanos. |
| `GET` | `/api/documentos/verificar/:cedula` | Sesión | Verifica la existencia de un estudiante por cédula. |
| `POST` | `/api/documentos/emitir` | Sesión | Registra la emisión de un documento y devuelve los datos. |
| `GET` | `/api/estadisticas` | Sesión | Totales y distribución por año/sección. |
| `GET` | `/api/reportes/seccion` | Sesión | Lista completa de una sección, sin paginar. |
| `GET` | `/api/ajustes` | Sesión | Director configurado y metadatos del logo. |
| `PUT` | `/api/ajustes/director` | Admin | Guarda el director que firma. |
| `GET` | `/api/ajustes/logo` | Sesión | Devuelve el logo guardado. |
| `PUT` | `/api/ajustes/logo` | Admin | Reemplaza el logo (cuerpo binario). |
| `GET` | `/api/ajustes/representantes-huerfanos` | Admin | Lista representantes sin estudiantes. |
| `POST` | `/api/ajustes/purgar-representantes` | Admin | Borra huérfanos revalidando el `DELETE`. |
| `POST` | `/api/ajustes/backup` | Admin | Escribe un respaldo en `backups/`. |

### Criterios de diseño de los métodos HTTP

- **Recurso y método explícitos:** `POST` crea, `GET` lee, `PUT` actualiza, `DELETE` borra. No se usan verbos dentro de la URL.
- **Validación en el borde:** los controladores validan cuerpo, parámetros y tipos antes de llamar al servicio.
- **Transacciones en el servicio:** `createEstudiante` y `updateEstudiante` agrupan estudiante, inscripción, documentos y vínculos.
- **Errores uniformes:** el servidor responde `{ code, message, details }`; el cliente traduce por `code`, no por el texto en inglés.
- **Cédula inmutable:** si el `PUT` intenta cambiar `tipo_ci` o `numero_ci`, responde `400`.

## 5. Métodos internos

### 5.1 Servidor

#### Autenticación y seguridad

| Método | Archivo | Uso | Por qué |
| ------ | ------- | --- | ------- |
| `login(usuario, clientHash)` | `auth.service.js` | Busca al usuario y verifica el digest. | Concentra la regla de autenticación. |
| `checkCredentials(row, clientHash)` | `auth/credentials.js` | Compara el hash recibido con el almacenado. | Aísla la decisión de credenciales válidas. |
| `derive(clientHash)` / `verify(...)` | `utils/password.js` | Genera y verifica el hash `scrypt` con sal. | Nunca se guarda la contraseña ni su SHA-256 solo. |
| `sign(payload)` / `verify(token)` | `utils/jwt.js` | Emite y valida el JWT. | Centraliza secreto y expiración. |
| `requireAuth` | `middlewares/auth.js` | Exige cookie válida y carga `req.user`. | Evita repetir la verificación en cada ruta. |
| `requireAdmin` | `middlewares/roles.js` | Exige rol `admin` para escrituras de ajustes y mantenimiento. | Separa lectura de operaciones sensibles. |
| `errorHandler` / `notFound` | `middlewares/error.js` | Traduce errores a JSON uniforme. | El cliente recibe siempre la misma forma. |

#### Estudiantes

| Método | Archivo | Uso | Por qué |
| ------ | ------- | --- | ------- |
| `assertValidStudent` | `estudiantes.controller.js` | Valida campos personales y cédula. | Falla temprano con detalles por campo. |
| `assertValidInscripcion` | `estudiantes.controller.js` | Valida año escolar, año, sección y fecha. | Evita datos académicos inconsistentes. |
| `assertValidRepresentantes` | `estudiantes.controller.js` | Valida nombre, cédula, teléfono, correo y `id` opcional. | Mantiene la regla de máximo un representante y permite editar por id. |
| `assertValidDocumentos` | `estudiantes.controller.js` | Valida los checkboxes de recaudos. | Los documentos son booleanos, no texto libre. |
| `getFullRecord(studentId)` | `estudiantes.service.js` | Ensambla estudiante + inscripciones + documentos + representantes. | Una sola lectura consistente para ficha, edición e impresión. |
| `listEstudiantes(filters)` | `estudiantes.service.js` | Pagina y busca en SQL. | No se trae el padrón completo a memoria. |
| `findOrCreateRepresentante(data)` | `estudiantes.service.js` | Reutiliza por `(tipo_ci, numero_ci)` o crea. | Un representante puede compartirse entre hermanos. |
| `linkRepresentantes(...)` | `estudiantes.service.js` | Inserta los vínculos del alta. | Separa persona de relación. |
| `createEstudiante(payload)` | `estudiantes.service.js` | Transacción de alta completa. | Si falla un paso, no queda media ficha. |
| `resolveDocumentos(...)` | `estudiantes.service.js` | Normaliza y guarda recaudos. | La inscripción siempre tiene su fila de documentos. |
| `createInscripcion(...)` | `estudiantes.service.js` | Agrega un año escolar a un estudiante existente. | No duplica ficha ni toca datos personales. |
| `updateEstudiante(id, payload)` | `estudiantes.service.js` | Actualiza datos y reconcilia representantes. | La edición es transaccional. |
| `reconcileRepresentantes(...)` | `estudiantes.service.js` | Desvincula, vincula o actualiza el representante. | Mantiene la relación N:M y el `parentesco` por vínculo. |
| `deleteEstudiante(id)` | `estudiantes.service.js` | Borra en cascada y purga huérfanos. | No deja representantes sin estudiantes. |

#### Documentos, estadísticas, reportes y ajustes

| Método | Archivo | Uso | Por qué |
| ------ | ------- | --- | ------- |
| `verificar(rawCedula)` | `documentos.service.js` | Normaliza la cédula y busca al estudiante. | Acepta el formato humano `V-12345678`. |
| `emitir({ tipo, estudiante_id, usuario_id })` | `documentos.service.js` | Registra la emisión y devuelve el resumen. | Deja auditoría de quién emitió qué. |
| `buildStudentSummary` / `buildRepresentante` | `documentos.service.js` | Preparan los datos que consume el navegador. | El servidor entrega datos, no HTML ni PDF. |
| `getEstadisticas(filters)` | `estadisticas.service.js` | Agrega totales y distribuciones. | Las cifras salen de la misma base que el listado. |
| `getSectionRoster({ anio, seccion, anio_escolar })` | `reportes.service.js` | Trae la sección completa y ordena por apellidos. | La hoja de asistencia no se pagina. |
| `getAjustes` / `saveDirector` / `saveLogo` / `getLogo` | `ajustes.service.js` | Leen y escriben configuración y logo. | Los ajustes no son datos de negocio. |
| `listOrphans` / `purgeOrphans` / `backup` | `ajustes.mantenimiento.js` | Auditoría, limpieza y respaldo. | El mantenimiento se ejecuta desde la app o la CLI. |

#### Utilidades

| Método | Archivo | Uso | Por qué |
| ------ | ------- | --- | ------- |
| `stripCedulaFormatting` / `normalizeNumeroCi` / `parseCedula` | `utils/cedula.js` | Unifican la cédula antes de comparar o guardar. | `V-00099` y `V-99` no deben ser personas distintas. |
| `HttpError` | `utils/httpError.js` | Construye errores con status, code y details. | Evita respuestas ad hoc. |
| `columnRejection` | `utils/mysqlErrors.js` | Traduce errores de columna de MySQL. | Convierte un error técnico en un 400 legible. |

### 5.2 Cliente

| Método / módulo | Archivo | Uso | Por qué |
| --------------- | ------- | --- | ------- |
| `request(path, options)` | `api.js` | Única puerta HTTP del cliente. | Ningún path se escribe a mano en una vista. |
| `api.*` | `api.js` | Una función por endpoint (`estudiantes`, `actualizarEstudiante`, etc.). | Contrato explícito y fácil de mockear en pruebas. |
| `sha256Hex` | `api.js` | Hash de contraseña antes del login. | El servidor recibe solo el digest. |
| `loadSession` / `login` / `logout` | `features/session.js` | Estado de sesión en el arranque y en login/logout. | La cookie es HttpOnly; el cliente solo conoce `GET /auth/me`. |
| `createRouter` / `go` / `normalizePath` | `router.js` | Navegación por hash. | El servidor sirve un único `index.html`. |
| `renderEstudiantes` y demás `render*` | `views/*.js` | Montan cada vista y cargan sus datos. | Cada vista es independiente y re-pinta solo su parte. |
| `renderEditForm` / `collect` / `validate` | `views/estudiantes.js` | Edición de ficha y representante. | Validación local antes del `PUT` y payload explícito. |
| `h` / `clear` / `applyProps` | `ui/dom.js` | Construcción de DOM y props. | Evita `innerHTML` con datos de la API. |
| `errorCopy` | `ui/messages.js` | Traduce códigos HTTP a español. | El `message` del servidor queda para logs, no para la interfaz. |
| `formatLatamDate` / `parseLatamDate` / `maskDateInput` | `ui/format.js` | Fechas `dd/mm/aaaa`, viaje ISO y máscara de escritura. | El formato visible no depende del idioma del navegador. |
| `openModal` | `ui/modal.js` | Diálogos de confirmación y ficha. | Un solo patrón de modal. |
| `buildFichaSheet` | `views/estudiantes.js` | Hoja imprimible de la ficha. | Se imprime una hoja aparte, no el modal. |
| `extractSheet` / `fillLetter` / `sheetNode` | `letter.js`, `views/documentos.js` | Componen los documentos imprimibles desde esqueletos HTML. | El navegador imprime; el servidor no genera PDF. |

## 6. Métodos de trabajo

| Método | Cómo se aplica | Por qué |
| ------ | -------------- | ------- |
| Validación en el borde | El controlador valida; el servicio asume datos válidos. | Evita repetir validaciones y mantiene claros los límites. |
| Separación controller → service → `db.tabla` | Las rutas delegan, los servicios deciden, `mysql-tab` accede. | Cambios de negocio no se mezclan con HTTP ni con SQL suelto. |
| Transacciones explícitas | Alta y edición de estudiante agrupan todos sus pasos. | No quedan fichas a medias ni vínculos huérfanos por un fallo intermedio. |
| Errores con `code` | El backend responde `{ code, message, details }` y el cliente traduce por `code`. | Logs técnicos en inglés, interfaz en español, sin acoplar la UI al texto. |
| Pruebas primero en comportamiento | Cada regla nueva tiene una prueba que falla antes del cambio. | Evita regresiones y documenta el contrato esperado. |
| Pruebas por capas | Unitarias para utilidades, e2e para endpoints, DOM mínimo para vistas. | Cada prueba usa la herramienta más barata que prueba lo importante. |
| Commits por unidad revisable | Se agrupan código, pruebas y documentación del mismo comportamiento. | El historial se puede revisar sin mezclar cambios ajenos. |
| Documentación viva | `README`, `docs/` y `odd/tasks/` se actualizan con el comportamiento. | La documentación no se separa de lo que el código hace. |

## 7. Decisiones que explican el porqué

### Sin framework de frontend

La aplicación tiene seis vistas, un router por hash y estado local acotado. Un framework agregaría build, dependencias y una capa de abstracción que no resuelve un problema actual. El DOM se construye con `h()` y se re-pinta solo la parte afectada.

### Sin bundler

El navegador carga módulos ESM nativos. No hay transpilación ni paso de build: en desarrollo el mismo proceso Express sirve `client/` directamente. Esto simplifica el desarrollo y elimina una fuente de fallos entre entornos.

### Sin ORM

`mysql-tab` y `tabla-model` dan lo necesario: modelos declarativos y consultas por tabla. Un ORM completo ocultaría el SQL en un proyecto donde las transacciones y los `UNIQUE` compuestos son parte central de las reglas.

### JWT en cookie HttpOnly

El token no se guarda en `localStorage`, así que JavaScript no puede leerlo ni robarlo por XSS. El cliente comprueba la sesión con `GET /api/auth/me` y el navegador envía la cookie automáticamente.

### Doble hash de contraseña

El cliente aplica SHA-256 y el servidor aplica `scrypt` con sal. El servidor nunca ve la contraseña original y la base guarda un hash lento de verificar. La comparación usa `timingSafeEqual` para no filtrar información por tiempo.

### Representantes compartidos

La persona vive en `representantes` y el vínculo con `parentesco` vive en `estudiante_representante`. Así dos hermanos comparten los datos del adulto sin duplicarlo, pero cada uno conserva su parentesco. La edición con `id` actualiza la persona para todos; el `parentesco` se actualiza solo en el vínculo editado.

### Documentos en el navegador

El servidor entrega datos y el navegador compone la hoja imprimible desde esqueletos HTML. No hace falta generar PDF ni almacenar archivos: se imprime con la vista de impresión del navegador y la emisión queda registrada en la base.

### Pruebas sin navegador

`node:test` cubre utilidades y endpoints; `dom-stub.mjs` cubre el render de las vistas. El layout visual se valida a mano en el navegador. Esta combinación mantiene la suite rápida y evita una dependencia pesada como jsdom o Playwright.

## 8. Referencias internas

- [README](../README.md): instalación, scripts y API.
- [BackToFront](./BackToFront.md): recorrido del código y decisiones de implementación.
- [usDataBase](./usDataBase.md): modelo de datos y consultas.
- [Tests](./Tests.md): suites, comandos y cobertura.
- [Mermaid](./Mermaid.md): diagramas de entidades y relaciones.
- [RelevantPoints](./RelevantPoints.md): puntos finos del comportamiento.
