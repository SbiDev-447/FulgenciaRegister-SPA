# Esquema de la base de datos

Esquema real de la base `fulgencia` (MariaDB 11), leído de `information_schema`.
Siete tablas: cinco de dominio, una de unión y una de acceso.

```mermaid
erDiagram
    ESTUDIANTES ||--o{ INSCRIPCIONES : "se inscribe en"
    ESTUDIANTES ||--o{ DOCUMENTOS_EMITIDOS : "recibe"
    ESTUDIANTES ||--o{ ESTUDIANTE_REPRESENTANTE : "tiene"
    REPRESENTANTES ||--o{ ESTUDIANTE_REPRESENTANTE : "representa a"
    INSCRIPCIONES ||--|| DOCUMENTOS_CONSIGNADOS : "consigna"
    USUARIOS |o--o{ INSCRIPCIONES : "es docente de"
    USUARIOS |o--o{ DOCUMENTOS_EMITIDOS : "emite"

    ESTUDIANTES {
        int id PK
        varchar(1) tipo_ci "V, E, J, P"
        varchar(12) numero_ci "UK junto a tipo_ci"
        varchar(60) primer_nombre
        varchar(60) segundo_nombre "nulo si no tiene"
        varchar(60) primer_apellido
        varchar(60) segundo_apellido "nulo si no tiene"
        date fecha_nacimiento
        varchar(1) sexo "M o F"
        varchar(60) pais_nacimiento "por defecto Venezuela"
        varchar(60) estado_nacimiento "por defecto Trujillo"
        varchar(60) municipio_nacimiento "por defecto Miranda"
        varchar(120) correo "nulo"
        varchar(20) telefono "nulo"
        varchar(20) lateralidad "nulo"
        varchar(10) talla "nulo"
        decimal peso "nulo, decimal(5,2) en kg"
        varchar(10) camisa "nulo"
        varchar(10) pantalon "nulo"
        varchar(10) zapatos "nulo"
        text direccion_habitacion "nulo"
        text alergico_a "nulo"
        text enfermedades_padecidas "nulo"
    }

    INSCRIPCIONES {
        int id PK
        int estudiante_id FK "CASCADE al borrar el estudiante"
        varchar(9) anio_escolar "p. ej. 2025-2026"
        varchar(10) anio "1er Año, 2do Año..."
        varchar(2) seccion "A por defecto"
        tinyint regular "1 = sí por defecto"
        tinyint repite "0 por defecto"
        int docente_id FK "nulo, SET NULL al borrar el usuario"
        date fecha_inscripcion
        int edad_inscripcion "nulo, calculada al inscribir"
    }

    DOCUMENTOS_CONSIGNADOS {
        int id PK
        int inscripcion_id FK "UK, uno a uno con la inscripción"
        tinyint partida_nacimiento "0 por defecto"
        tinyint copia_cedula "0 por defecto"
        tinyint boleta "0 por defecto"
        tinyint fotos "0 por defecto"
        tinyint carpeta "0 por defecto"
        tinyint certificado_6to_grado "0 por defecto"
    }

    REPRESENTANTES {
        int id PK
        varchar(1) tipo_ci "V, E, J, P"
        varchar(12) numero_ci "UK junto a tipo_ci"
        varchar(120) nombre "nombre completo en un solo campo"
        date fecha_nacimiento "nulo"
        varchar(20) telefono "nulo"
        varchar(120) correo "nulo"
        varchar(30) estado_civil "nulo"
        text direccion_habitacion "nulo"
    }

    ESTUDIANTE_REPRESENTANTE {
        int estudiante_id PK, FK "CASCADE"
        int representante_id PK, FK "CASCADE"
        varchar(30) parentesco "nulo: madre, padre, abuelo..."
    }

    DOCUMENTOS_EMITIDOS {
        int id PK
        int estudiante_id FK "CASCADE"
        varchar(30) tipo "conducta, estudio, retiro, aceptacion"
        int usuario_id FK "nulo, SET NULL al borrar el usuario"
        datetime fecha_emision "current_timestamp por defecto"
    }

    USUARIOS {
        int id PK
        varchar(50) usuario "UK, nombre de inicio de sesión"
        varchar(255) password_hash "scrypt"
        varchar(64) salt
        varchar(120) nombre
        varchar(20) rol "docente por defecto; tambien admin"
        datetime creado_en "current_timestamp por defecto"
    }
```

## Cardinalidades

| Relación | Tipo | Regla |
| --- | --- | --- |
| `estudiantes` → `inscripciones` | 1 : N | Un alumno acumula una inscripción por año escolar; la clave única `(estudiante_id, anio_escolar)` impide matricularlo dos veces en el mismo año. |
| `estudiantes` → `documentos_emitidos` | 1 : N | Cada constancia o carta emitida queda registrada con su fecha y con quién la emitió. |
| `estudiantes` ↔ `representantes` | N : M | Resuelta en `estudiante_representante`, con el `parentesco` como atributo de la relación. Un representante puede tener varios alumnos a su cargo; un alumno puede tener varios representantes. |
| `inscripciones` → `documentos_consignados` | 1 : 1 | La columna `inscripcion_id` es única: el checklist de recaudos pertenece a la inscripción, no al alumno. |
| `usuarios` → `inscripciones` | 1 : N (opcional) | `docente_id` es nulo cuando la inscripción no tiene docente asignado. |
| `usuarios` → `documentos_emitidos` | 1 : N (opcional) | `usuario_id` queda en nulo si el usuario que emitió el documento se elimina, para no perder el registro de emisión. |

## Reglas de borrado

- **CASCADE**: borrar un estudiante arrastra sus inscripciones, sus documentos consignados (vía inscripción), los vínculos con representantes y sus documentos emitidos.
- **SET NULL**: borrar un usuario no borra inscripciones ni documentos; solo deja sin responsable el campo correspondiente.

## Notas

- `usuarios` no se relaciona con `estudiantes`: el sistema no crea cuentas para alumnos.
- Las cédulas son únicas por **tipo + número** en `estudiantes` y en `representantes`, no por número solo.
- No hay ningún índice `FULLTEXT` en la base: la búsqueda del listado se resuelve con `LIKE` y un puntaje por columna calculado en SQL.
- Las tallas y el peso son texto o decimal suelto a propósito; no se comparan ni se convierten en el servidor.
- Este esquema es el que crea `db:seed` sobre una base vacía; si la base ya existe con columnas cortas, `db:repair-schema` las ensancha sin borrar datos.
