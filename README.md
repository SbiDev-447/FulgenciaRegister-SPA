![Banner](./files/Banner.webp)

# FULGENCIA REGISTER - SPA

**SPA de registro e inscripción estudiantil** para el Liceo Fulgencia Jiménez de Olmos, esta SPA se encargara de la administración de los datos de los estudiantes a la hora de la realización de las Inscripciones de los mismos, permitiendo una gestión fácil y segura, respaldando la información en una DB (MariaDB), asimismo, funcionara para la expedición automatizada de Documentos (Constancias y Cartas).

> Interfaz en JavaScript vanilla sin recarga de página, API REST en Express y base de datos MariaDB en Docker.

## 👥 Integrantes

- Sebastian Briceño **C.I.:** 32.117.825
- Claudia Montilla **C.I.:** 33.711.807
- Ruthmar Verbel **C.I.:** 32.346.703

## Estado del proyecto

| Componente | Estado |
| ---------- | ------ |
| Backend (API REST) | Listo — 99 pruebas en verde |
| Base de datos (MariaDB) | Listo — esquema y datos semilla |
| Frontend (SPA) | Inicio y Estudiantes listos — 55 pruebas en verde |

El backend está completo y cubierto por pruebas. En la SPA ya funcionan el shell,
el router, los temas y las vistas de Inicio y Estudiantes (lista, búsqueda, ficha,
edición y borrado con confirmación); la vista de Documentos está en construcción, y la
sección "Alcance" describe lo planificado.

## Alcance

- **Inicio:** estadísticas de inscripción — total de estudiantes, distribución por sexo
  y por año, documentos emitidos. Filtro por año académico y sección.
- **Estudiantes:** CRUD de inscripción con ficha permanente (datos personales,
  inscripción, representantes y documentos consignados). Búsqueda por nombre o cédula.
- **Documentos:** verificación por cédula y emisión de cuatro documentos imprimibles
  (carta de aceptación, constancia de conducta, constancia de retiro, constancia de estudio).
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
│   ├── assets/              # tipografías e imágenes locales
│   ├── styles/              # tokens.css, reset.css, layout.css, views/
│   ├── js/                  # main.js, routes.js, router.js, shell.js, api.js
│   │   ├── views/           # una vista por ruta (login, inicio, estudiantes, ...)
│   │   ├── features/        # sesión, tema e inscripción (el wizard de 4 pasos)
│   │   └── ui/              # helpers DOM (h, clear, svgIcon), iconos, modal, copy de errores y formato de contacto
│   └── test/                # pruebas del cliente (node:test, sin navegador)
├── server/                  # API REST (Express + mysql-tab)
│   ├── src/
│   │   ├── config/          # variables de entorno y pool de MariaDB
│   │   ├── modules/         # auth, estudiantes, documentos, estadisticas
│   │   ├── middlewares/     # auth, error
│   │   ├── constants/       # academico, auth, documentos
│   │   └── utils/           # cedula, password, jwt, httpError
│   ├── model/               # modelos tabla-model (esquema)
│   ├── db/seed.js           # datos semilla
│   └── test/                # pruebas del servidor (node:test)
├── files/                   # recursos del repositorio (banner)
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
| DELETE | `/api/estudiantes/:id` | Eliminar estudiante (y los representantes que se queden sin ninguno) |
| GET | `/api/documentos/verificar/:cedula` | Verificar una cédula |
| POST | `/api/documentos/emitir` | Emitir un documento |
| GET | `/api/estadisticas` | Estadísticas de inscripción |

## Rutas de la SPA

El enrutado es por hash: todo ocurre en la misma página, sin recargas.

| Ruta | Vista |
| ---- | ----- |
| `#/` | Inicio — estadísticas de inscripción con filtros |
| `#/estudiantes` | Listado con búsqueda y filtros, ficha del estudiante, y acciones Ver / Editar / Borrar |
| `#/inscripcion` | Wizard de inscripción en 4 pasos |
| `#/documentos` | Documentos (en construcción) |

El wizard **no** tiene entrada en el menú lateral: se llega desde el botón "Nueva
inscripción" de Estudiantes y, como carga sus propias opciones académicas, un
enlace directo o una recarga funcionan igual.

## Scripts

| Comando | Acción |
| ------- | ------ |
| `pnpm dev` | API en modo desarrollo (con recarga) |
| `pnpm start` | API en modo producción |
| `pnpm db:up` / `pnpm db:down` | Levantar / detener MariaDB |
| `pnpm db:reset` | Recrear la base de datos (borra los datos) |
| `pnpm db:seed` | Crear tablas y datos semilla |
| `pnpm db:purge-orphans` | Borrar representantes que quedaron sin ningún estudiante (ver abajo) |
| `pnpm db:repair-schema` | Ensanchar columnas que quedaron demasiado pequeñas (ver abajo) |
| `pnpm db:dump` | Guardar una copia de la base de datos en `backups/` (ver abajo) |
| `pnpm db:restore` | Devolver una copia: sin `--apply` solo dice qué haría (ver abajo) |
| `pnpm test` | Ejecutar todas las pruebas (servidor y cliente) |

### Respaldos y mover el proyecto a otro equipo

La carpeta del proyecto lleva la **receta** de la base de datos —`docker-compose.yml`, los
modelos, el seed— y nunca su **contenido**. Copiar la carpeta a otro equipo da la aplicación
funcionando con una escuela vacía; para llevarse los datos hay que llevarse un respaldo.

```bash
pnpm db:dump                      # guarda backups/<base>-<fecha>.sql
pnpm db:restore                   # dice qué haría con el respaldo más nuevo; no escribe
pnpm db:restore backups/x.sql --apply   # lo restaura de verdad
```

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

Para pasar el proyecto a otro equipo: `pnpm db:dump` en este, copiar el `.sql` y el `.env`
(a mano, por un pendrive o donde corresponda), y en el otro `pnpm db:up && pnpm db:restore
<archivo>.sql --apply`.

### Columnas demasiado pequeñas

Las tablas se crean **una sola vez**, la primera vez que arranca la API, y después el
modelo (`server/model/*.js`) no se vuelve a aplicar. Si una columna resulta ser más
estrecha de lo que la aplicación necesita, el código queda bien y las bases de datos
creadas antes del arreglo quedan mal: siguen rechazando datos válidos y nadie lo nota
hasta que alguien prueba ese valor.

Le pasó a `estudiantes.lateralidad`: era `varchar(10)` y el formulario ofrece
`Ambidiestro`, que tiene 11 letras. El `INSERT` moría con `ER_DATA_TOO_LONG` y el usuario
solo veía «Ocurrió un error en el servidor».

```bash
pnpm db:repair-schema           # muestra qué falta; no toca nada
pnpm db:repair-schema --apply   # ensancha exactamente esas columnas
```

El comando **solo ensancha** y se niega a hacer cualquier otra cosa: una columna `varchar`
más ancha no puede truncar nada, mientras que estrecharla sí puede destruir datos. Es
idempotente, así que correrlo dos veces no hace nada la segunda vez, y al terminar vuelve
a leer la base de datos para informar lo que de verdad quedó, no lo que intentó.

Ensanchar la columna no cierra la clase, solo el caso conocido: cualquier valor que no quepa
en su columna —un nombre de 61 letras, un peso de 1234,56 en `decimal(5,2)`— seguía llegando
a MySQL y volvía como «Ocurrió un error en el servidor», un callejón sin salida que no dice
qué campo arreglar. La API ahora traduce los rechazos del driver (`ER_DATA_TOO_LONG`,
`ER_WARN_DATA_OUT_OF_RANGE`, `ER_TRUNCATED_WRONG_VALUE_FOR_FIELD`) a un **400 que nombra el
campo**, reusando el mismo vocabulario que la validación normal, así que el formulario lo
marca y lo dice en español. Lo que el driver no sabe nombrar sigue siendo un 500: adivinar
el campo mandaría al usuario a un control que no es el problema.

### Representantes sin estudiante

Un representante es una fila **compartida**: su identidad es la cédula
(`tipo_ci` + `numero_ci`), así que varios hermanos pueden apuntar al mismo registro.
Por eso solo se borra cuando el **último** estudiante lo suelta, y hay dos momentos
para eso:

- **Al eliminar un estudiante** (`DELETE /api/estudiantes/:id`) la limpieza es
  automática, en la misma transacción del borrado.
- **Para lo que ya quedó atrás**, el comando explícito:

```bash
pnpm db:purge-orphans           # muestra qué borraría; no toca nada
pnpm db:purge-orphans --apply   # borra exactamente esos representantes
```

Editar un estudiante (`PUT /api/estudiantes/:id`) y enviar la lista de representantes
vacía **desvincula** pero no borra: ese representante puede seguir siendo de otro
estudiante, y una edición no debería borrar datos de terceros. Esos casos los resuelve
el comando, que nunca toca un representante que conserve algún enlace.

El formulario de edición de la SPA edita **solo la ficha del propio estudiante**: no
envía representantes ni inscripciones, que tienen sus propias pantallas. La cédula se
muestra pero no se envía — el servidor la rechaza como inmutable.

Un campo opcional que se deja en blanco se envía como `null`, nunca como `""`:
`peso` es `decimal(5,2)` y una cadena vacía responde 500. Por lo mismo, los campos que
el servidor valida (nombres, fecha, contacto, lugar de nacimiento, lateralidad) siguen
siendo obligatorios en el formulario y no se pueden vaciar.

Las fechas se escriben y se muestran siempre como `dd/mm/aaaa` y viajan al API como
`aaaa-mm-dd`. Los campos son de texto y no `input[type=date]` a propósito: el orden que
muestra el control nativo lo decide el idioma del navegador, no la página, así que la
misma fecha de nacimiento se leía `04/03/2010` en la ficha y `03/04/2010` en el campo que
la editaba. La conversión vive en `client/js/ui/format.js` (`parseLatamDate` /
`formatLatamDate`) y la comparten el wizard, el formulario de edición y la ficha. Una
fecha que no existe (`31/02/2010`) se rechaza en el cliente con un mensaje que indica la
forma esperada.

Los campos de fecha **escriben sus propias barras**: basta teclear los ocho dígitos y el
`/` aparece donde corresponde (`autoSeparateDate` en `client/js/ui/dom.js`). No es adorno:
el teclado numérico de un teléfono solo ofrece los dígitos 0–9, así que sin esto la fecha
sería imposible de escribir en un móvil. La regla del separador solo **añade** y solo sobre
un valor que creció (`maskDateInput`), de modo que el retroceso siempre funciona — la barra
no vuelve a aparecer — y una edición en medio del texto nunca se reescribe en silencio.
Al pegar, `parseLatamDate` acepta además `04-03-2010`, `4.3.2010` y `04032010`.

## Pruebas

| Suite | Comando | Alcance |
| ----- | ------- | ------- |
| Servidor | `pnpm --filter @fulgencia/server test` | 99 pruebas con `node:test`. La suite e2e y las pruebas de `db:dump`/`db:restore` que necesitan la base se saltan si no hay `.env` o contenedor. |
| Cliente | `pnpm --filter @fulgencia/client test` | 55 pruebas con `node:test` que ejecutan cada vista contra un DOM mínimo, **sin navegador**: comprueban que las vistas pintan, qué texto ve una persona ante un rechazo del API, que el wizard rechaza un correo, un teléfono o una fecha imposible, que las fechas se leen `dd/mm/aaaa` y viajan como ISO, y que la tabla de Estudiantes edita, borra con confirmación y no envía la cédula. |

`pnpm test` corre las dos. Lo que las pruebas del cliente **no** cubren es el
resultado visual: el layout se valida a mano en el navegador (`Ctrl+F5` en
`http://localhost:3000`).

## Roadmap

- [x] Estructura del monorepo y base de datos
- [x] Autenticación (login, sesión, cierre)
- [x] API de estudiantes (CRUD y representantes)
- [x] API de documentos y estadísticas
- [x] Interfaz SPA (shell, router, temas)
- [x] Vistas de inicio y estudiantes (lista, ficha, edición, borrado y wizard de inscripción)
- [ ] Vista de documentos
- [ ] Generación e impresión de documentos
