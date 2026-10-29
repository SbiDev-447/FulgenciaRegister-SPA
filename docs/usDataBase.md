# usDataBase — Nuestra base de datos explicada

> Documento de estudio y operación. Explica **cómo se conecta** la aplicación a
> MariaDB, **qué guarda cada tabla**, **cómo se relacionan** y **qué comandos SQL**
> usar para trabajar la base fuera del servidor (DBeaver, TablePlus, MySQL Workbench,
> línea de comandos...).
>
> Este archivo vive en `docs/` y **sí** está versionado: viaja con el repositorio. La
> idea de dejarlo fuera fue de una versión anterior del proyecto; hoy se mantiene al día
> con cada cambio de esquema, igual que `mermaid.md`.

Todo lo que dice acá está comprobado contra la base real (octubre 2026). Cuando algo es
una recomendación y no un hecho del sistema, lo digo explícitamente.

---

## 1. Panorama

| Pieza | Detalle |
| ----- | ------- |
| Motor | **MariaDB 11** corriendo en Docker (`docker-compose.yml`, contenedor `fulgencia-db`) |
| Base | `fulgencia` (el nombre sale de `DB_NAME`) |
| Puerto | `3306` en tu máquina (sale de `DB_PORT`), redirigido al 3306 del contenedor |
| Motor de tablas | `InnoDB` en las siete — por eso hay transacciones y claves foráneas |
| Acceso desde el código | `mysql-tab` → `dbtabla` → `mysql2` |
| Tablas | 7 (más abajo, el mapa) |
| Migraciones | **No existen.** Ver §8, es importante |

Volumen Docker declarado `fulgencia-db-data` —Docker lo prefija con el nombre del
proyecto, así que en la práctica aparece como `fulgenciaproject_fulgencia-db-data`—:
ahí viven los datos de verdad. Si lo borras, la base vuelve a nacer vacía.

---

## 2. Cómo se conecta la aplicación

### 2.1 Las variables de entorno

`server/src/config/env.js` valida que existan **antes** de arrancar. Si falta alguna,
el servidor no arranca y dice cuáles:

```
Missing required environment variables: DB_HOST, DB_PORT, ...
```

| Variable | Obligatoria | Rol |
| -------- | ----------- | --- |
| `DB_HOST` | sí | Host de MariaDB. En desarrollo: `127.0.0.1` |
| `DB_PORT` | sí | Puerto. En desarrollo: `3306` |
| `DB_USER` | sí | Usuario de la base |
| `DB_PASSWORD` | sí | Contraseña de ese usuario |
| `DB_NAME` | sí | Nombre de la base (`fulgencia`) |
| `JWT_SECRET` | sí | Firma de los JWT (no es de la base, pero se exige en el mismo control) |
| `MARIADB_ROOT_PASSWORD` | no | Solo la usa `docker-compose.yml` para el usuario `root` del contenedor |

Los valores reales están en `.env`, en la raíz del repo. **No los copio acá a
propósito**: este archivo no es sitio para credenciales.

### 2.2 Quién abre la conexión

`server/src/config/db.js` hace exactamente tres cosas:

```js
const db = new MySQL(config)        // 1. crea el manejador con las credenciales
for (const model of models) {       // 2. registra los 7 modelos (el esquema)
  db.addModel(model)
}
module.exports = db                 // 3. lo exporta como única puerta de acceso
```

La decisión de diseño que hay que entender: **no hay una capa de repositorios propia**.
Los módulos usan `db.tabla('<nombre>')` directamente contra la librería. Por eso el
código de una consulta se lee así:

```js
const estudiantes = await db.tabla('estudiantes').select()
await db.tabla('estudiante_representante').insert({ estudiante_id, representante_id, parentesco })
```

API de `db.tabla(...)` (la de `dbtabla`). La forma normal de llamarla es **con un objeto
de opciones**, no con argumentos posicionales: contar posiciones es cómo se cuelan los
`undefined` en el lugar equivocado, y una consulta que olvida el tercer argumento
devuelve otra cosa sin avisar.

| Método | Firma (forma objeto) | Para qué |
| ------ | -------------------- | -------- |
| `select` | `select({ campos, joins, where, group, having, order, limit })` | Leer |
| `selectOne` | `selectOne({ where })` | Leer una fila |
| `selectById` | `selectById(id)` | Leer por clave primaria — **usa este, no `selectOne`** |
| `paginate` | `paginate({ campos, where, order, page, limit })` | Página + `{ data, total, page, limit, totalPages, hasNext, hasPrev }` |
| `busqueda` | `busqueda({ cadena, campo_bus, campos, where, order })` | Buscar con puntaje |
| `busquedaPaginate` | `busquedaPaginate({ cadena, campo_bus, campos, where, order, page, limit })` | Buscar + paginar |
| `busquedaPaginada` | `busquedaPaginada({ ... })` | Variante con cursor |
| `insert` | `insert(datos)` | Insertar |
| `insertAll` | `insertAll([datos, ...])` | Insertar en lote |
| `update` | `update(sets, { where })` | Actualizar |
| `updateById` | `updateById(id, sets)` | Actualizar por PK |
| `delete` | `delete({ where })` | Borrar |
| `deleteById` | `deleteById(id)` | Borrar por PK |
| `ready` | `ready()` | Esperar a que la tabla exista |
| `lastSql` | propiedad (`string`) | El último SQL armado, para depurar |

Detalles que cuestan una tarde si no se saben:

- **No existe `offset`.** La paginación va en `limit: [desplazamiento, cantidad]`, que
  se traduce a `LIMIT desplazamiento,cantidad`.
- **`selectOne({ where })` pierde el `LIMIT 1`**: la rama de objeto ignora los
  posicionales. Para una fila por clave primaria usa `selectById(id)`.
- **El `where` objeto** acepta un `%` al final del valor para `LIKE`, y el prefijo `||`
  para encadenar con `OR`. Solo expresa condiciones de la tabla que estás consultando.
- **No usa placeholders**: interpola los valores escapándolos. Un `%` escrito en un
  buscador actúa de comodín. Sigue siendo más seguro que armar el SQL a mano, pero no
  es una barrera contra texto de usuario: eso lo hace la validación del servidor.
- **Un `where` como string en SQL crudo sigue funcionando** — de ahí que la purga pueda
  escribir `NOT EXISTS (...)`. Es cómodo y es la puerta por donde se cuela SQL mal
  armado: si algún día interpolas texto de usuario ahí, tienes inyección.

Y el SQL de verdad, el que no es una consulta a una tabla, va por `db.query(sql)` —
DDL, `TRUNCATE`, los `CREATE TABLE` de `createAllTables()`. Sobre `db` directamente hay
`tabla`, `query`, `createAllTables`, `addModel` y `end` (comprobado con `typeof`).

El servidor arranca con `node --env-file-if-exists=../.env`, así que lee el `.env` de
la raíz sin librerías extra (`scripts` en `server/package.json`).

---

## 3. Conectarse a la base (sin pasar por el servidor)

### 3.1 Levantar / apagar la base

```bash
pnpm db:up        # docker compose up -d    → levanta MariaDB
pnpm db:down      # docker compose down     → la apaga (los datos QUEDAN)
pnpm db:reset     # down -v && up -d        → BORRA el volumen: adiós datos
pnpm db:seed      # crea las tablas que falten + usuario admin
pnpm db:demo      # 30 estudiantes de demostración (vacía las tablas de personas)
pnpm db:repair-schema   # ensancha columnas que quedaron cortas, sin tocar datos
```

`db:reset` destruye el volumen entero. `db:demo` es el otro comando que se lleva datos
por delante: vacía `documentos_emitidos`, `documentos_consignados`,
`estudiante_representante`, `inscripciones`, `estudiantes` y `representantes` —**no
toca `usuarios`**— y siembra 30 estudiantes deterministas e idempotentes. Es para tener
algo que mirar en desarrollo, nunca para una base con datos reales.

El `docker-compose.yml` tiene `restart: "no"` a propósito: en un portátil, la base no
debe arrancar sola al encender el equipo. Hay que pedirla.

### 3.2 Cliente de línea de comandos

Dentro del contenedor ya está el cliente de MariaDB. La forma más rápida, sin instalar
nada, es entrar al contenedor con las credenciales del `.env`:

```bash
# carga las variables del .env en la sesión actual
set -a; . ./.env; set +a

docker exec -it fulgencia-db mariadb -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"
```

Y si quieres ejecutar una consulta y salir, sin sesión interactiva:

```bash
docker exec -i fulgencia-db mariadb -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  -e "SELECT COUNT(*) AS estudiantes FROM estudiantes"
```

### 3.3 Desde un IDE (DBeaver, TablePlus, Workbench, HeidiSQL)

Los datos de conexión salen del `.env`; en desarrollo con el compose tal cual:

| Campo | Valor |
| ----- | ----- |
| Motor | MariaDB / MySQL |
| Host | `127.0.0.1` (o `localhost`) |
| Puerto | el de `DB_PORT` (por defecto `3306`) |
| Base de datos | el de `DB_NAME` (`fulgencia`) |
| Usuario | el de `DB_USER` |
| Contraseña | la de `DB_PASSWORD` |

Como el puerto está publicado al host (`"${DB_PORT:-3306}:3306"`), el IDE conecta
directo contra `127.0.0.1`: no hace falta entrar al contenedor.

Si el IDE se queja de la zona horaria o del `root`, usa el usuario de la app
(`DB_USER`); es el que tiene permisos sobre `fulgencia` y con el que trabaja el
servidor, así que ves exactamente lo que ve la aplicación.

---

## 4. Mapa de las tablas

Siete tablas. Léelas como tres grupos: **personas**, **el hecho académico** y
**los papeles**.

```
                           ┌──────────────┐
                           │  usuarios    │  quien opera el sistema (auth)
                           └──────┬───────┘
                  docente_id      │      usuario_id
                  (SET NULL)      │      (SET NULL)
                                  │
   ┌──────────────┐        ┌──────┴─────────┐
   │representantes│        │  inscripciones │        ┌───────────────────────┐
   └──────┬───────┘        └──────┬─────────┘        │ documentos_consignados│
          │                       │ estudiante_id    │ (checklist 1:1 con la │
          │                       │ (CASCADE)        │  inscripción)         │
          │                       │                  └───────────────────────┘
          │  ┌────────────────────┴───────┐
          │  │       estudiantes          │
          │  └────────────────────┬───────┘
          │                       │ estudiante_id (CASCADE)
          │  ┌────────────────────┴───────┐
          │  │    documentos_emitidos     │  bitácora de PDFs generados
          │  └────────────────────────────┘
          │
   ┌──────┴────────────────────────┐
   │  estudiante_representante     │  puente N:M + parentesco
   │  (estudiante_id, rep_id)      │
   └───────────────────────────────┘
```

| Tabla | Qué guarda | Quién la usa |
| ----- | ---------- | ------------ |
| `usuarios` | Quien entra al sistema: credenciales y rol | módulo `auth` |
| `estudiantes` | La persona: datos personales, físicos y médicos | `estudiantes`, `estadisticas`, `documentos` |
| `representantes` | El adulto responsable (padre, madre, tutor) | `estudiantes` |
| `estudiante_representante` | **Quién es representante de quién** y con qué parentesco | `estudiantes`, `documentos` |
| `inscripciones` | El hecho académico: año, sección, condición | `estudiantes`, `estadisticas` |
| `documentos_consignados` | Los seis recaudos entregados de una inscripción | `estudiantes` |
| `documentos_emitidos` | Bitácora: qué PDF se emitió, para quién y cuándo | `documentos`, `estadisticas` |

Detalle de las ideas centrales:

- **La persona y su inscripción son cosas distintas.** `estudiantes` guarda la ficha
  permanente; `inscripciones` guarda "este año, en tal sección". Un estudiante puede
  tener varias inscripciones a lo largo del tiempo (una por año escolar).
- **Un representante no pertenece a un estudiante.** Es una persona propia, y el
  vínculo vive en el puente. Por eso dos hermanos comparten el mismo representante sin
  duplicar la persona, y por eso el `parentesco` está en el puente (Juan es "Madre" de
  Pedro y "Tía" de Ana: misma persona, distinto vínculo).
- **El checklist es de la inscripción, no del estudiante.** Los recaudos se entregan
  cada año.
- **`documentos_emitidos` es bitácora, no configuración.** Solo registra emisiones;
  los cuatro tipos posibles están en `server/src/constants/documentos.js`.

---

## 5. Diccionario de datos

### 5.1 `usuarios`

| Columna | Tipo | Nulo | Notas |
| ------- | ---- | ---- | ----- |
| `id` | `int` | no | PK, autoincremental |
| `usuario` | `varchar(50)` | no | **UNIQUE** (simple) |
| `password_hash` | `varchar(255)` | no | scrypt sobre el SHA-256 del cliente |
| `salt` | `varchar(64)` | no | sal del scrypt |
| `nombre` | `varchar(120)` | no | nombre para mostrar |
| `rol` | `varchar(20)` | no | default `'docente'`. Hoy en uso: `'admin'` |
| `creado_en` | `datetime` | no | `CURRENT_TIMESTAMP` |

**Cómo funciona la contraseña** (importante si vas a crear usuarios por SQL): el
cliente manda `SHA-256(password)` y el servidor le aplica `scrypt` encima, con una sal
aleatoria. La base **nunca** ve la contraseña en claro. Consecuencia práctica: no
puedes "leer" una contraseña desde la base; para crear o restablecer un usuario hay
que generar el par `salt` + `hash` con el mismo algoritmo (§9.12).

### 5.2 `estudiantes`

| Columna | Tipo | Nulo | Notas |
| ------- | ---- | ---- | ----- |
| `id` | `int` | no | PK |
| `tipo_ci` | `varchar(1)` | no | `V` / `E` — **ver §6, el UNIQUE no es lo que parece** |
| `numero_ci` | `varchar(12)` | no | número de cédula |
| `primer_nombre`, `segundo_nombre` | `varchar(60)` | el segundo sí | |
| `primer_apellido`, `segundo_apellido` | `varchar(60)` | el segundo sí | |
| `fecha_nacimiento` | `date` | no | |
| `sexo` | `varchar(1)` | no | en uso: `M`, `F` |
| `pais_nacimiento` | `varchar(60)` | sí | default `'Venezuela'` |
| `estado_nacimiento` | `varchar(60)` | sí | default `'Trujillo'` |
| `municipio_nacimiento` | `varchar(60)` | sí | default `'Miranda'` |
| `correo` | `varchar(120)` | sí | |
| `telefono` | `varchar(20)` | sí | |
| `lateralidad` | `varchar(10)` | sí | en uso: `Derecha`, `Izquierda` |
| `talla` | `varchar(10)` | sí | **altura en cm** (el wizard la rotula "Talla (cm)") — no es una talla de ropa |
| `peso` | `decimal(5,2)` | sí | |
| `camisa`, `pantalon`, `zapatos` | `varchar(10)` | sí | tallas de ropa y calzado, texto libre (`S`, `M`, `L`, `38`…) |
| `direccion_habitacion` | `text` | sí | |
| `alergico_a` | `text` | sí | dato médico |
| `enfermedades_padecidas` | `text` | sí | dato médico |

Sin `creado_en` ni `actualizado_en`: no hay rastro de cuándo se creó o modificó una
ficha.

### 5.3 `representantes`

| Columna | Tipo | Nulo | Notas |
| ------- | ---- | ---- | ----- |
| `id` | `int` | no | PK |
| `tipo_ci` | `varchar(1)` | no | `V` / `E` — mismo caso que estudiantes |
| `numero_ci` | `varchar(12)` | no | |
| `nombre` | `varchar(120)` | no | nombre completo en **un solo campo** (a diferencia del estudiante) |
| `fecha_nacimiento` | `date` | sí | |
| `telefono` | `varchar(20)` | sí | |
| `correo` | `varchar(120)` | sí | |
| `estado_civil` | `varchar(30)` | sí | sin datos en la base actual |
| `direccion_habitacion` | `text` | sí | |

Persona propia: se reutiliza por `(tipo_ci, numero_ci)` y **nunca se actualiza** al
reutilizarla. Si un hermano cambia el teléfono del padre, ese cambio no llega acá por
el camino de la inscripción.

### 5.4 `estudiante_representante` (el puente)

| Columna | Tipo | Nulo | Notas |
| ------- | ---- | ---- | ----- |
| `estudiante_id` | `int` | no | **PK compuesta** + FK → `estudiantes.id` |
| `representante_id` | `int` | no | **PK compuesta** + FK → `representantes.id` |
| `parentesco` | `varchar(30)` | sí | en uso: `Madre`, `Padre`, `Filio` |

Es la única fuente de verdad de "quién es representante de quién". La PK compuesta
impide duplicar el mismo par (no puedes enlazar dos veces al mismo representante con
el mismo estudiante). Aquí sí hay `CASCADE` en ambos lados.

### 5.5 `inscripciones`

| Columna | Tipo | Nulo | Notas |
| ------- | ---- | ---- | ----- |
| `id` | `int` | no | PK |
| `estudiante_id` | `int` | no | FK → `estudiantes.id`. **UNIQUE compuesto con `anio_escolar`** |
| `anio_escolar` | `varchar(9)` | no | en uso: `2025-2026`, `2026-2027` |
| `anio` | `varchar(10)` | no | en uso: `1er Año` … `5to Año` (las etiquetas de `constants/academic.js`) |
| `seccion` | `varchar(2)` | no | default `'A'`. Válidas por año: 1º-2º → A..F, 3º → A..E, 4º-5º → A..D |
| `regular` | `tinyint(1)` | no | default `1` |
| `repite` | `tinyint(1)` | no | default `0` |
| `docente_id` | `int` | sí | FK → `usuarios.id` |
| `fecha_inscripcion` | `date` | no | |
| `edad_inscripcion` | `int` | sí | edad calculada al inscribir |

El UNIQUE compuesto `(estudiante_id, anio_escolar)` es lo que impide inscribir al mismo
estudiante dos veces en el mismo año escolar. Es una regla de negocio viviendo en un
índice — buena defensa, y hay que conocerla antes de tocar la tabla.

### 5.6 `documentos_consignados`

| Columna | Tipo | Nulo | Notas |
| ------- | ---- | ---- | ----- |
| `id` | `int` | no | PK |
| `inscripcion_id` | `int` | no | **UNIQUE** (simple) + FK → `inscripciones.id`: 1 a 1 |
| `partida_nacimiento` | `tinyint(1)` | no | default `0` |
| `copia_cedula` | `tinyint(1)` | no | default `0` |
| `boleta` | `tinyint(1)` | no | default `0` |
| `fotos` | `tinyint(1)` | no | default `0` |
| `carpeta` | `tinyint(1)` | no | default `0` |
| `certificado_6to_grado` | `tinyint(1)` | no | default `0` |

Seis booleanos (`0`/`1`). Una fila por inscripción, no por estudiante.

### 5.7 `documentos_emitidos`

| Columna | Tipo | Nulo | Notas |
| ------- | ---- | ---- | ----- |
| `id` | `int` | no | PK |
| `estudiante_id` | `int` | no | FK → `estudiantes.id` (CASCADE) |
| `tipo` | `varchar(30)` | no | los 4 slugs de `constants/documentos.js` |
| `usuario_id` | `int` | sí | FK → `usuarios.id` (SET NULL): quién emitió |
| `fecha_emision` | `datetime` | no | `CURRENT_TIMESTAMP` |

Tipos válidos: `carta_aceptacion`, `constancia_conducta`, `constancia_retiro`,
`constancia_estudio`. Alimenta la tarjeta "documentos emitidos" de Inicio.

---

## 6. Relaciones y qué pasa cuando borras

### 6.1 Las siete claves foráneas

| Desde | Hacia | Al borrar el padre | Al actualizar |
| ----- | ----- | ------------------ | ------------- |
| `estudiante_representante.estudiante_id` | `estudiantes.id` | **CASCADE** | CASCADE |
| `estudiante_representante.representante_id` | `representantes.id` | **CASCADE** | CASCADE |
| `inscripciones.estudiante_id` | `estudiantes.id` | **CASCADE** | CASCADE |
| `inscripciones.docente_id` | `usuarios.id` | **SET NULL** | CASCADE |
| `documentos_consignados.inscripcion_id` | `inscripciones.id` | **CASCADE** | CASCADE |
| `documentos_emitidos.estudiante_id` | `estudiantes.id` | **CASCADE** | CASCADE |
| `documentos_emitidos.usuario_id` | `usuarios.id` | **SET NULL** | CASCADE |

### 6.2 Consecuencias prácticas (esto es lo que te ahorra un susto)

**Borrar un estudiante borra en cascada**, sin preguntar:

- sus filas de `inscripciones` (y, por rebote, el `documentos_consignados` de cada una);
- sus filas del puente `estudiante_representante` (el vínculo, no la persona);
- su bitácora en `documentos_emitidos`.

Y **deja huérfano** al representante si no compartía con nadie: la persona sigue en
`representantes` sin ningún estudiante que la referencie. Eso es exactamente el
problema que resuelven el barrido del `DELETE` y la purga (§9.6).

**Borrar un usuario no borra historia.** `inscripciones.docente_id` y
`documentos_emitidos.usuario_id` pasan a `NULL` (`SET NULL`): el registro académico y
la bitácora sobreviven, solo pierden el nombre de quién era. Es una decisión correcta:
el rol de docente es un dato de auditoría, no un requisito de la fila.

**Borrar una inscripción** se lleva su checklist (`documentos_consignados`), pero no
toca al estudiante.

**El orden importa** si haces borrados a mano: primero lo que depende, después el
padre. Con `CASCADE` configurado, borrar el padre hace el trabajo — pero solo si
realmente quieres todo eso.

---

## 7. Trampas comprobadas del esquema

### 7.1 El UNIQUE compuesto disfrazado de simple

En `estudiante.model.js` y `representante.model.js` los dos campos están marcados así:

```js
{ name: 'tipo_ci',   type: 'varchar(1)',  defaultNull: false, unique: true },
{ name: 'numero_ci', type: 'varchar(12)', defaultNull: false, unique: true },
```

Leído rápido, parecen **dos** UNIQUE independientes. Y si lo fueran, la base solo
aceptaría **un** `V` y **un** `E` en todo el sistema: `tipo_ci` valdría `V` una sola
vez. Sería un bug brutal.

No lo es. `tabla-model` **fusiona los `unique: true` consecutivos en un único índice
compuesto**. En la base real se ve así:

| TABLE_NAME | INDEX_NAME | NON_UNIQUE | SEQ_IN_INDEX | COLUMN_NAME |
| ---------- | ---------- | ---------- | ------------ | ----------- |
| `estudiantes` | `tipo_ci` | 0 | 1 | `tipo_ci` |
| `estudiantes` | `tipo_ci` | 0 | **2** | `numero_ci` |

Dos filas, un solo índice, dos columnas: el UNIQUE real es `(tipo_ci, numero_ci)`, que
es lo que el comentario del modelo promete. Lo mismo pasa en `representantes` y en
`inscripciones` (`(estudiante_id, anio_escolar)`).

**Por qué te importa:**

1. El índice **hereda el nombre de la primera columna** (`tipo_ci`), igual que un
   `INDEX` normal. En un IDE se ve como un índice más; hay que abrirlo para ver que
   abarca dos columnas.
2. La fusión depende de que las columnas sean **consecutivas**. Si algún día metes una
   columna no-unique entre `tipo_ci` y `numero_ci`, los dos UNIQUE dejan de fusionarse
   y **el esquema cambia de significado** sin que nada te avise: pasarías a tener dos
   restricciones simples y solo podrías guardar un `V`.
3. Como el compuesto empieza por `tipo_ci`, buscar **solo** por `numero_ci` no
   aprovecha el índice (regla del prefijo izquierdo). En un padrón grande, la búsqueda
   por número de cédula sin el tipo hace un escaneo completo.

Comparación con el otro caso de la base: `documentos_consignados.inscripcion_id` y
`usuarios.usuario` son UNIQUE **simples** de verdad (un solo `SEQ_IN_INDEX`, ninguna
columna unique pegada al lado). La diferencia está en la vecindad, no en la intención.

### 7.2 Índices duplicados que genera la librería

Al crear las tablas, para cada FK `tabla-model` crea su propio índice, y como el
esquema ya tiene índices que empiezan por esas mismas columnas, quedan duplicados:

| Tabla | Índices redundantes |
| ----- | ------------------- |
| `inscripciones` | `estudiante_id` (UNIQUE compuesto) + `estudiante_id_2` (FK, no único, fusionado con `docente_id`) + `m2s_inscripciones_usuarios_2` |
| `documentos_consignados` | `inscripcion_id` (UNIQUE) e `inscripcion_id_2` (FK, no único) |
| `estudiante_representante` | PK `(estudiante_id, representante_id)` + `estudiante_id` (FK) + `m2s_ ..._representantes_2` |
| `documentos_emitidos` | `estudiante_id` (fusionado con `usuario_id`) + `m2s_documentos_emitidos_usuarios_2` |

No rompe nada y no es urgente, pero tiene dos costos: espacio, y un poco de trabajo
extra en cada `INSERT`/`UPDATE`/`DELETE` porque hay que mantener índices que se pisan.
Los `_2` y los `m2s_` son nombres **generados** por la librería: no los edites a mano,
los recrea.

### 7.3 La base no valida el dominio

Ninguna columna usa `ENUM` y no hay tablas de catálogo. Los valores válidos viven en
el **servidor** (`server/src/constants/academic.js` para años y secciones,
`constants/documentos.js` para los tipos de documento, más los validadores del módulo
de estudiantes).

La prueba: en una base de pruebas se aceptaron sin chistar cosas como
`pais_nacimiento = 'sjnjswj'`, `parentesco = 'SMKSNK'` y cédulas de relleno. La base las
guardó porque **no tiene forma de rechazarlas**. Si quieres comprobarlo en la tuya, corre
`pnpm db:demo` (siembra datos de demostración válidos) y después inserta un valor absurdo
por SQL: entra igual.

Consecuencia: la base confía en quien escribe. Un `INSERT` desde un IDE, un script
suelto o un endpoint nuevo que olvide validar pueden meter basura que después aparece
en reportes. Si quieres que la base se defienda sola, el camino es agregar `CHECK`
constraints o `ENUM` con un `ALTER TABLE` (§8.2) — no es urgente, pero es la respuesta
correcta si te preocupa la integridad.

---

## 8. El esquema y su evolución

### 8.1 No hay migraciones (y lo comprobé)

El esquema son los archivos de `server/model/`, y las tablas se crean llamando a
`db.createAllTables()`, que es lo que hace `pnpm db:seed`.

Probé en una base desechable qué tan lejos llega eso:

1. Creé las tablas desde los modelos → aparecieron las 7.
2. Borré a mano la columna `estudiantes.alergico_a`.
3. Volví a correr `createAllTables()` → **no dio error y no restauró la columna**.

Conclusión: **crea las tablas que faltan, no repara ni migra las que ya existen.** Si
cambias un modelo, la base **no** se actualiza sola. El seed además es idempotente con
el usuario admin: si ya existe, no lo duplica.

### 8.2 Cómo cambiar el esquema entonces

Dos caminos, y solo uno conserva datos:

```sql
-- Camino A: conservar datos → ALTER a mano (y luego reflejarlo en el modelo, no al revés)
ALTER TABLE estudiantes ADD COLUMN grupo_sanguineo VARCHAR(5) NULL AFTER enfermedades_padecidas;
```

```bash
# Camino B: base de desarrollo sin nada valioso → tirar y recrear
pnpm db:reset && pnpm db:seed   # BORRA todo el volumen
```

Regla para no equivocarte: **el modelo es la fuente de verdad del esquema, pero quien
lo aplica a una base con datos eres tú.** Después de un `ALTER`, actualiza el modelo
para que una base nueva nazca igual; si lo haces al revés (modelo primero), no pasa
nada automático.

---

## 9. Recetas SQL para el IDE

Todo esto se puede pegar tal cual en DBeaver o en la sesión del contenedor. Si estás
en la CLI, entra primero como en §3.2.

### 9.1 Ver el terreno

```sql
SHOW TABLES;
SHOW CREATE TABLE estudiantes;        -- DDL completo, con índices y FKs
SHOW FULL COLUMNS FROM estudiantes;   -- columnas, tipos, nulos, defaults
SHOW INDEX FROM estudiantes;          -- aquí se ven los índices compuestos reales
SELECT TABLE_NAME, TABLE_ROWS, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE();
```

### 9.2 Contar todo de una vez

```sql
SELECT 'usuarios' AS tabla, COUNT(*) AS filas FROM usuarios
UNION ALL SELECT 'estudiantes', COUNT(*) FROM estudiantes
UNION ALL SELECT 'representantes', COUNT(*) FROM representantes
UNION ALL SELECT 'estudiante_representante', COUNT(*) FROM estudiante_representante
UNION ALL SELECT 'inscripciones', COUNT(*) FROM inscripciones
UNION ALL SELECT 'documentos_consignados', COUNT(*) FROM documentos_consignados
UNION ALL SELECT 'documentos_emitidos', COUNT(*) FROM documentos_emitidos;
```

### 9.3 La ficha completa de un estudiante (las 5 tablas en un solo golpe)

```sql
SELECT
  e.id,
  CONCAT(e.tipo_ci, '-', e.numero_ci)          AS cedula,
  CONCAT_WS(' ', e.primer_nombre, e.segundo_nombre,
                 e.primer_apellido, e.segundo_apellido) AS nombre_completo,
  e.fecha_nacimiento, e.sexo, e.correo, e.telefono,
  i.anio, i.anio_escolar, i.seccion, i.regular, i.repite,
  i.fecha_inscripcion, i.edad_inscripcion,
  r.nombre                                     AS representante,
  er.parentesco,
  CONCAT(r.tipo_ci, '-', r.numero_ci)          AS cedula_representante,
  r.telefono                                   AS telefono_representante,
  dc.partida_nacimiento, dc.copia_cedula, dc.boleta,
  dc.fotos, dc.carpeta, dc.certificado_6to_grado
FROM estudiantes e
LEFT JOIN inscripciones i              ON i.estudiante_id  = e.id
LEFT JOIN estudiante_representante er  ON er.estudiante_id = e.id
LEFT JOIN representantes r             ON r.id             = er.representante_id
LEFT JOIN documentos_consignados dc    ON dc.inscripcion_id = i.id
ORDER BY e.primer_apellido, e.primer_nombre;
```

`LEFT JOIN` en todo a propósito: un estudiante sin representante o sin checklist debe
**aparecer igual**, con `NULL` en esas columnas. Con `JOIN` a secas, desaparecería sin
avisarte.

### 9.4 Buscar por cédula

```sql
SELECT e.*, i.anio, i.anio_escolar, i.seccion
FROM estudiantes e
LEFT JOIN inscripciones i ON i.estudiante_id = e.id
WHERE e.numero_ci = '15784944';
```

Si ese número no existe en tu base, la consulta devuelve **cero filas**: eso no es un
error, es que no está. Cámbialo por una cédula real.

Recuerda §7.1: si buscas solo por `numero_ci`, el índice no ayuda. Por eso existe la
búsqueda por el par completo:

```sql
SELECT * FROM estudiantes WHERE tipo_ci = 'V' AND numero_ci = '15784944';
```

### 9.5 Integridad: cosas que no deberían existir

```sql
-- Estudiantes sin ningún representante
SELECT e.id, CONCAT(e.tipo_ci,'-',e.numero_ci) AS cedula, e.primer_apellido
FROM estudiantes e
WHERE NOT EXISTS (
  SELECT 1 FROM estudiante_representante er WHERE er.estudiante_id = e.id
);

-- Estudiantes sin inscripción (ficha creada y nunca inscrita)
SELECT e.id, CONCAT(e.tipo_ci,'-',e.numero_ci) AS cedula
FROM estudiantes e
WHERE NOT EXISTS (SELECT 1 FROM inscripciones i WHERE i.estudiante_id = e.id);

-- Inscripciones sin checklist de documentos
SELECT i.id, i.estudiante_id, i.anio_escolar
FROM inscripciones i
WHERE NOT EXISTS (
  SELECT 1 FROM documentos_consignados dc WHERE dc.inscripcion_id = i.id
);

-- Cédulas lógicas duplicadas (mismo par tipo+número)
SELECT tipo_ci, numero_ci, COUNT(*) AS veces
FROM estudiantes
GROUP BY tipo_ci, numero_ci HAVING veces > 1;
```

### 9.6 Representantes huérfanos (el problema que resolvió la purga)

Un representante con **cero** enlaces es basura: ninguna pantalla ni endpoint lo
alcanza. Esta es exactamente la condición que usa el comando `pnpm db:purge-orphans`,
así que puedes auditarla antes de correrlo:

```sql
-- ¿Cuáles son?
SELECT r.id, CONCAT(r.tipo_ci,'-',r.numero_ci) AS cedula, r.nombre, r.telefono, r.correo
FROM representantes r
WHERE NOT EXISTS (
  SELECT 1 FROM estudiante_representante er WHERE er.representante_id = r.id
);

-- ¿Cuántos son?
SELECT COUNT(*) AS huerfanos
FROM representantes r
WHERE NOT EXISTS (
  SELECT 1 FROM estudiante_representante er WHERE er.representante_id = r.id
);

-- Borrarlos a mano (lo mismo que hace --apply, en una sola sentencia)
DELETE FROM representantes
WHERE NOT EXISTS (
  SELECT 1 FROM estudiante_representante er WHERE er.representante_id = representantes.id
);
```

Nota de seguridad: si borras desde el IDE, **no uses una lista de ids que leíste antes**.
Entre tu `SELECT` y tu `DELETE` alguien podría vincular a ese representante, y borrarías
una persona recién reclamada. La condición `NOT EXISTS` dentro del `DELETE` evalúa todo
en el mismo instante y cierra esa ventana.

### 9.7 Representantes compartidos (hermanos)

```sql
SELECT r.nombre AS representante,
       COUNT(*)  AS estudiantes
FROM estudiante_representante er
JOIN representantes r ON r.id = er.representante_id
GROUP BY er.representante_id
HAVING estudiantes > 1;
```

### 9.8 Recaudos faltantes por año

```sql
SELECT i.anio, i.seccion, COUNT(*) AS inscripciones,
       SUM(dc.partida_nacimiento = 0) AS sin_partida,
       SUM(dc.copia_cedula = 0)       AS sin_cedula,
       SUM(dc.boleta = 0)             AS sin_boleta,
       SUM(dc.fotos = 0)              AS sin_fotos,
       SUM(dc.carpeta = 0)            AS sin_carpeta,
       SUM(dc.certificado_6to_grado = 0) AS sin_certificado
FROM inscripciones i
JOIN documentos_consignados dc ON dc.inscripcion_id = i.id
GROUP BY i.anio, i.seccion
ORDER BY i.anio, i.seccion;
```

### 9.9 Estadísticas (lo que muestra Inicio)

```sql
-- Por sexo
SELECT sexo, COUNT(*) AS estudiantes FROM estudiantes GROUP BY sexo;

-- Por año y sección, filtrando por año escolar
SELECT i.anio, i.seccion, COUNT(*) AS inscritos
FROM inscripciones i
WHERE i.anio_escolar = '2026-2027'
GROUP BY i.anio, i.seccion
ORDER BY i.anio, i.seccion;

-- Documentos emitidos por tipo
SELECT tipo, COUNT(*) AS emitidos
FROM documentos_emitidos
WHERE YEAR(fecha_emision) = YEAR(CURDATE())
GROUP BY tipo;
```

### 9.10 ¿Duplicaría esta inscripción una regla de negocio?

Antes de insertar, comprueba el UNIQUE compuesto:

```sql
SELECT * FROM inscripciones
WHERE estudiante_id = 124 AND anio_escolar = '2026-2027';
```

Si devuelve una fila, la base va a rechazar el `INSERT` por el índice
`(estudiante_id, anio_escolar)`. Mejor saberlo antes que leer un error de driver.

### 9.11 Respaldar y restaurar

```bash
# Respaldar SOLO los datos de la base
docker exec fulgencia-db mariadb-dump -u"$DB_USER" -p"$DB_PASSWORD" \
  --single-transaction "$DB_NAME" > respaldo-$(date +%F).sql

# Respaldar con la estructura incluida y comprimido
docker exec fulgencia-db mariadb-dump -u"$DB_USER" -p"$DB_PASSWORD" \
  --single-transaction --routines --triggers "$DB_NAME" | gzip > respaldo-$(date +%F).sql.gz

# Restaurar en una base vacía
docker exec -i fulgencia-db mariadb -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < respaldo-2026-10-17.sql
```

`--single-transaction` toma una foto coherente sin bloquear la base (InnoDB lo
permite). Úsalo siempre: sin eso, un respaldo durante una inscripción puede quedar
inconsistente.

En esta imagen el binario se llama **`mariadb-dump`**. El viejo `mysqldump` **no
existe** en el contenedor (lo comprobé): si copias un comando de internet que use
`mysqldump`, va a fallar.

### 9.12 Crear o restablecer un usuario por SQL

La contraseña se guarda como `scrypt(SHA-256(password))` con una sal. Este script
calcula el par igual que `server/db/seed.js`:

```bash
node -e "
const crypto = require('node:crypto');
const password = process.argv[1];
const clientHash = crypto.createHash('sha256').update(password).digest('hex');
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(clientHash, salt, 64).toString('hex');
console.log('salt: ' + salt);
console.log('hash: ' + hash);
" 'miPasswordSegura'
```

Y luego, con esos dos valores:

```sql
INSERT INTO usuarios (usuario, password_hash, salt, nombre, rol)
VALUES ('nuevo.docente', '<hash>', '<salt>', 'Nombre Apellido', 'docente');

-- O restablecer la contraseña de uno existente
UPDATE usuarios
SET password_hash = '<hash>', salt = '<salt>'
WHERE usuario = 'admin';
```

Sin el par exacto, el usuario no podrá entrar: no hay forma de "recuperar" la
contraseña desde la base, solo de reemplazarla.

### 9.13 Operaciones peligrosas: mira antes de borrar

```sql
-- ¿Qué se llevará por delante borrar este estudiante?
SELECT
  (SELECT COUNT(*) FROM inscripciones i WHERE i.estudiante_id = 196)             AS inscripciones,
  (SELECT COUNT(*) FROM estudiante_representante er WHERE er.estudiante_id = 196) AS enlaces,
  (SELECT COUNT(*) FROM documentos_emitidos de WHERE de.estudiante_id = 196)     AS documentos,
  (SELECT COUNT(*) FROM documentos_consignados dc
     JOIN inscripciones i ON i.id = dc.inscripcion_id
    WHERE i.estudiante_id = 196)                                                AS checklist;
```

Si esos números no son los que esperabas, no borres. Y si borras: hazlo dentro de una
transacción, revisa el resultado y decide:

```sql
START TRANSACTION;
DELETE FROM estudiantes WHERE id = 196;
-- revisa aquí lo que quieras
-- ROLLBACK;   -- me arrepentí
-- COMMIT;     -- confirmo
```

---

## 10. Lo que la base NO hace

Resumen de límites reales del esquema, para que no los descubras en producción:

| No hay | Consecuencia |
| ------ | ------------ |
| Migraciones | Un modelo nuevo no cambia una base existente (§8) |
| Validación de dominio (`ENUM`, `CHECK`, catálogos) | Cualquier texto entra si el servidor no lo filtra (§7.3) |
| `created_at` / `updated_at` | No se puede saber cuándo se creó o editó una ficha |
| Borrado lógico | Los `DELETE` son físicos: lo borrado no se recupera sin respaldo |
| Borrado de representantes automático | Solo al borrar un estudiante o al correr la purga; desvincular no borra |
| Auditoría por fila | Solo `documentos_emitidos` deja bitácora |

---

## 11. Chuleta final

```bash
# Base
pnpm db:up                          # levantarla
pnpm db:down                        # apagarla (conserva datos)
pnpm db:seed                        # crear tablas faltantes + admin
pnpm db:reset && pnpm db:seed       # recrear desde cero (BORRA datos)
pnpm db:demo                        # 30 estudiantes de demostración (BORRA personas)
pnpm db:repair-schema               # ensanchar columnas cortas, sin tocar datos
pnpm db:purge-orphans               # auditar representantes huérfanos (no borra)
pnpm db:purge-orphans --apply       # borrarlos de verdad
pnpm db:dump                        # respaldo en backups/<base>-<fecha>.sql
pnpm db:restore                     # decir qué haría con el último respaldo
pnpm db:restore backups/x.sql --apply   # restaurarlo de verdad

# Cliente SQL dentro del contenedor
set -a; . ./.env; set +a
docker exec -it fulgencia-db mariadb -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"
```

Conceptos que hay que tener en la cabeza al tocar esta base:

1. **`estudiante_representante` es el corazón de las relaciones.** Si algo "no aparece"
   en una consulta, casi siempre es por ese puente.
2. **Los índices `tipo_ci` son compuestos** `(tipo_ci, numero_ci)` y heredan el nombre
   de la primera columna. Otro caso igual en `inscripciones`.
3. **La base confía en el servidor.** No repite las validaciones, no las conoce.
4. **Sin migraciones**: cambiar el esquema con datos dentro es un `ALTER` consciente,
   no un comando.
5. **InnoDB + FKs con `CASCADE`**: un `DELETE` de más puede llevarse cuatro tablas
   consigo. Mira antes de borrar.
