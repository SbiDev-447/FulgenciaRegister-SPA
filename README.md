![Banner](./files/Banner.webp)

# FULGENCIA REGISTER - SPA

**SPA de registro e inscripción estudiantil** para un liceo. Interfaz en JavaScript
vanilla sin recarga de página, API REST en Express y base de datos MariaDB.

## Estado del proyecto

| Componente | Estado |
| ---------- | ------ |
| Backend (API REST) | Listo — suite de pruebas en verde (74/74) |
| Base de datos (MariaDB) | Listo — esquema y datos semilla |
| Frontend (SPA) | En desarrollo |

El backend está completo y cubierto por pruebas. La interfaz (SPA) está en
construcción: las vistas de la sección siguiente describen el alcance planificado.

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
├── client/                  # SPA vanilla JS (en construcción)
│   ├── index.html
│   ├── assets/              # tipografías e imágenes locales
│   ├── styles/              # tokens.css, reset.css, layout.css, views/
│   └── js/                  # main.js, router.js, api.js, views/, features/
├── server/                  # API REST (Express + mysql-tab)
│   ├── src/
│   │   ├── modules/         # auth, estudiantes, documentos, estadisticas
│   │   ├── middlewares/     # auth, error
│   │   ├── constants/       # academico, auth, documentos
│   │   └── utils/           # cedula, password, jwt, httpError
│   ├── model/               # modelos tabla-model (esquema)
│   ├── db/seed.js           # datos semilla
│   └── test/                # pruebas (node:test)
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

Para detener la base de datos usa `pnpm db:down`. Para recrearla desde cero (borra
los datos) usa `pnpm db:reset && pnpm db:seed`.

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
| DELETE | `/api/estudiantes/:id` | Eliminar estudiante |
| GET | `/api/documentos/verificar/:cedula` | Verificar una cédula |
| POST | `/api/documentos/emitir` | Emitir un documento |
| GET | `/api/estadisticas` | Estadísticas de inscripción |

## Scripts

| Comando | Acción |
| ------- | ------ |
| `pnpm dev` | API en modo desarrollo (con recarga) |
| `pnpm start` | API en modo producción |
| `pnpm db:up` / `pnpm db:down` | Levantar / detener MariaDB |
| `pnpm db:reset` | Recrear la base de datos (borra los datos) |
| `pnpm db:seed` | Crear tablas y datos semilla |
| `pnpm test` | Ejecutar todas las pruebas |

## Roadmap

- [x] Estructura del monorepo y base de datos
- [x] Autenticación (login, sesión, cierre)
- [x] API de estudiantes (CRUD y representantes)
- [x] API de documentos y estadísticas
- [ ] Interfaz SPA (shell, router, temas)
- [ ] Vistas de inicio, estudiantes y documentos
- [ ] Generación e impresión de documentos
