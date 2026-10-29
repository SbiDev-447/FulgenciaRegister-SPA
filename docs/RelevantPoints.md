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

### Quién decide el esquema (y por qué hoy no hay migraciones)

Esta sección generaliza el caso anterior y termina en una decisión: **por ahora no se
implementa nada**. Conviene que quien la lea sepa exactamente qué significa eso.

Los modelos (`server/model/*.js`) **declaran el esquema completo**: columnas, tipos,
nulabilidad, valores por defecto, índices únicos y claves foráneas con `CASCADE` o
`SET NULL`. `db.createAllTables()` corre al arrancar la API y **crea las tablas que
falten, una sola vez**; después nunca vuelve a comparar nada. Se verificó corriéndolo dos
veces: la segunda devuelve `ok` para las siete tablas, sin detectar diferencias y sin
error. Nada en el repositorio sabe si una base ya creada sigue coincidiendo con los
modelos.

Lo que sí está verificado (18/10/2026): una base creada hoy desde los modelos es
**idéntica** a la base viva —tipos, nulos, defaults, índices y claves foráneas—. Los
modelos no mienten. El problema no es que digan algo falso: es que **después del primer
arranque nadie los vuelve a aplicar**. Cambiar un modelo no toca una base existente, y por
eso `lateralidad` hubo que arreglarlo aparte con `db:repair-schema`, que es una **lista
escrita a mano** con las columnas conocidas.

El precio ya se pagó una vez sin que quedara anotado: `estudiantes` fue **recreada** (su
`create_time` es del 18/10/2026 y el de las otras seis tablas del 09/10/2026) y su
contenido se perdió en el camino —al documentar la base el 17/10 había 10 estudiantes; hoy
queda 1 fila tecleada a mano—. Ensanchar la columna se terminó resolviendo recreando la
tabla, no alterándola.

**El riesgo que queda abierto**, y el motivo por el que esto está escrito: dos bases
creadas desde el mismo commit pueden diferir en silencio. El caso realista es esta máquina
y la del colegio. `db:dump` y `db:restore` cubren los datos y la estructura, pero no
responden «¿estas dos bases son iguales?».

**Cuándo volver a mirar esto** (no antes): cuando aparezca el primer cambio **no aditivo**
—renombrar una columna, endurecer un tipo, rellenar datos existentes— o cuando se ponga en
marcha la máquina del colegio. Todo lo que la aplicación necesita hoy, incluida la vista de
Documentos, es **aditivo**: tablas y columnas nuevas, donde el modelo y una base recién
creada coinciden solos.

Lo que ya se descartó, para no volver a discutirlo:

- **Un ORM con migraciones** (Prisma, Drizzle, Knex): descartado. Reescribe cada servicio
  —unas 2500 líneas ya probadas— para resolver un problema de flujo con un framework.
- **El CLI inverso de `mysql-tab`** (`npx mysql-tab --path …`): **está roto en 2.1.1**.
  `inverseEngine.js` llama a `__keysInTable` y el método se llama `_keysInTable`: alguien
  renombró uno y nadie actualizó el otro. No sirve para comparar ni para regenerar modelos.
- **Quitar `mysql-tab`**: no se plantea. Sigue siendo la conexión, las consultas y las
  transacciones (`db.tabla`, `db.query`, `db.addModel`, `db.end`), y los modelos siguen
  alimentando `db.addModel`. Lo único que un esquema con migraciones le quitaría son dos
  llamadas: `server/src/index.js:8` y `server/db/seed.js:21`.

Si algún día el riesgo se materializa y hay que empezar por lo más barato, el primer paso es
**una consulta guardada**, sin escribir código. Se compara contra `server/model/*.js` a ojo:

```sql
SELECT CONCAT(table_name,'.',column_name,' = ',column_type,
       IF(is_nullable='YES',' NULL',' NOT NULL'),' def=',COALESCE(column_default,'-'))
FROM information_schema.columns
WHERE table_schema='fulgencia'
ORDER BY table_name, ordinal_position;
```

Solo si eso no alcanza tendría sentido un chequeo automático (unas 120 líneas contra
`information_schema`, usando `db.query`, que es API pública) o migraciones SQL con una
tabla `schema_migrations` (runner de unas 100 líneas, con el punto de partida sacado de la
base actual con `mariadb-dump --no-data`, que hoy está correcta).

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


### Paginación del listado de estudiantes

`GET /api/estudiantes` devuelve **una página**, no la tabla entera:

```json
{ "estudiantes": [], "total": 57, "page": 1, "pageSize": 20, "pages": 3 }
```

- `page` es 1-based; `pageSize` tiene techo de **100** y por defecto 20. Valores
  basura (`page=abc`) caen al default en vez de fallar: un marcador viejo tiene que
  seguir mostrando filas.
- `total` cuenta **el conjunto filtrado**, no la tabla: es el mismo predicado SQL que
  elige las filas, para que el resumen nunca contradiga la tabla.
- Una `page` fuera de rango se sirve como la última, y la respuesta informa la página
  que realmente sirvió.
- `anio`/`seccion` se resuelven con `EXISTS` en SQL y **antes** del `LIMIT`. Filtrar
  después de limitar dejaría páginas cortas o vacías — es la razón por la que la
  versión anterior (cruzar todo en memoria) no podía paginar.
- El orden es total (`primer_apellido`, `primer_nombre`, `id`). Con un orden que
  empata, MySQL puede contestar cada página en un orden distinto y repetir una fila
  mientras salta otra.

### Sintaxis de objeto en `dbtabla` (mysql-tab)

Las consultas del servidor usan la forma con nombre, no la posicional:

```js
db.tabla('estudiantes').selectById(id)               // clave primaria
db.tabla('estudiantes').select({ where: { id: ids }, order: 'anio_escolar DESC' })
db.tabla('usuarios').selectOne({ where: { usuario } })
```

La forma posicional (`select(null, null, { id }, null, null, 'orden')`) obliga a contar
posiciones para saber si el tercer argumento es `where` o ya es `order`. La forma objeto
viene de `dbtabla@2.2.10` y acepta `campos`, `joins`, `where`, `group`, `having`, `order`,
`limit`. Dos cosas que la documentación no dice:

- **No hay clave `offset`.** El offset va dentro de `limit: [offset, cantidad]`, que
  genera `LIMIT offset,cantidad`.
- **`selectOne({ where })` pierde el `LIMIT 1`.** `selectOne` pasa el 1 como séptimo
  argumento posicional, y la rama de objeto ignora los posicionales: devuelve todas las
  filas y se queda con la primera. El resultado es el correcto, pero deja de traer una
  sola fila. Para clave primaria, `selectById` no tiene ese problema.

Quedan dos consultas en `listEstudiantes` con `db.query` y `?` a propósito: un
`COUNT(*)` y un `EXISTS` sobre otra tabla no se expresan con el objeto `where`, y pasar
el filtro como string perdería los valores enlazados.
