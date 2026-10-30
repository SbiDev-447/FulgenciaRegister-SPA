## Pruebas

| Suite | Comando | Alcance |
| ----- | ------- | ------- |
| Servidor | `pnpm --filter @fulgencia/server test` | 118 pruebas con `node:test` (117 en verde y 1 saltada: la que necesita la base cuando no hay `.env` o contenedor). Cubren, entre otras cosas, el contrato de paginación del listado — `total`, `pages`, página fuera de rango servida como la última y `pageSize` con techo —, la emisión de documentos, y los ajustes: la cédula del director se guarda canónica, cada campo inválido se nombra junto, el logo se comprueba **por firma de bytes** (un PNG falso con `Content-Type: image/png` es 400), la purga borra sólo al representante que ningún estudiante referencia y el respaldo devuelve un `.sql` que de verdad contiene tablas. Las escrituras de ajustes y el mantenimiento responden 403 a cualquier rol que no sea `admin`. |
| Cliente | `pnpm --filter @fulgencia/client test` | 90 pruebas con `node:test` que ejecutan cada vista contra un DOM mínimo, **sin navegador**: comprueban que las vistas pintan, qué texto ve una persona ante un rechazo del API, que el wizard rechaza un correo, un teléfono o una fecha imposible, que las fechas se leen `dd/mm/aaaa` y viajan como ISO, que la tabla de Estudiantes edita, borra con confirmación y no envía la cédula, que la paginación pide la página siguiente, que el ojo de la contraseña alterna el campo sin perder el cursor, y que Ajustes rellena el director y el logo desde el API, traduce el rechazo sin dejar pasar el mensaje en inglés, esconde el mantenimiento a quien no es administrador y pide confirmación antes de borrar huérfanos. |

`pnpm test` corre las dos. Lo que las pruebas del cliente **no** cubren es el
resultado visual: el layout se valida a mano en el navegador (`Ctrl+F5` en
`http://localhost:3000`).
