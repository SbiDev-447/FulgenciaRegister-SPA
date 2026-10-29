## Pruebas

| Suite | Comando | Alcance |
| ----- | ------- | ------- |
| Servidor | `pnpm --filter @fulgencia/server test` | 105 pruebas con `node:test` (104 en verde y 1 saltada: la que necesita la base cuando no hay `.env` o contenedor). Cubren, entre otras cosas, el contrato de paginación del listado — `total`, `pages`, página fuera de rango servida como la última y `pageSize` con techo — y la emisión de documentos. |
| Cliente | `pnpm --filter @fulgencia/client test` | 81 pruebas con `node:test` que ejecutan cada vista contra un DOM mínimo, **sin navegador**: comprueban que las vistas pintan, qué texto ve una persona ante un rechazo del API, que el wizard rechaza un correo, un teléfono o una fecha imposible, que las fechas se leen `dd/mm/aaaa` y viajan como ISO, que la tabla de Estudiantes edita, borra con confirmación y no envía la cédula, que la paginación pide la página siguiente y que el ojo de la contraseña alterna el campo sin perder el cursor. |

`pnpm test` corre las dos. Lo que las pruebas del cliente **no** cubren es el
resultado visual: el layout se valida a mano en el navegador (`Ctrl+F5` en
`http://localhost:3000`).
