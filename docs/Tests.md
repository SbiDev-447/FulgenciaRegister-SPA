## Pruebas

| Suite | Comando | Alcance |
| ----- | ------- | ------- |
| Servidor | `pnpm --filter @fulgencia/server test` | 99 pruebas con `node:test`. La suite e2e y las pruebas de `db:dump`/`db:restore` que necesitan la base se saltan si no hay `.env` o contenedor. |
| Cliente | `pnpm --filter @fulgencia/client test` | 55 pruebas con `node:test` que ejecutan cada vista contra un DOM mínimo, **sin navegador**: comprueban que las vistas pintan, qué texto ve una persona ante un rechazo del API, que el wizard rechaza un correo, un teléfono o una fecha imposible, que las fechas se leen `dd/mm/aaaa` y viajan como ISO, y que la tabla de Estudiantes edita, borra con confirmación y no envía la cédula. |

`pnpm test` corre las dos. Lo que las pruebas del cliente **no** cubren es el
resultado visual: el layout se valida a mano en el navegador (`Ctrl+F5` en
`http://localhost:3000`).
