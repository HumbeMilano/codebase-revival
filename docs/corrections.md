# Correcciones de HomeHub

La revisión del 22 de octubre de 2026 se implementa como una actualización coordinada de frontend y base de datos. La interfaz utiliza el viewport real y mantiene la información del hogar al recargar.

| Área           | Corrección                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administración | Retirada la reclamación pública del primer administrador; el propietario debe aprovisionar su UUID explícitamente.                                                                     |
| PIN y tablet   | Presupuesto de intentos compartido, passkeys recientes de adulto para nuevas vinculaciones, caducidad y revocación de los códigos heredados, entrada por teclado y cancelación segura. |
| Permisos       | Suspensión aplicada a RPC y tablas; autorización financiera vinculada al solicitante, con caducidad de 15 minutos y revocación.                                                        |
| Miembros       | Cambios serializados por hogar; protección del último adulto y de la última cuenta adulta; historial protegido al eliminar o desvincular.                                              |
| Guardado       | Facturas, repartos y ajustes en una transacción; colecciones atómicas con revisión esperada y detección de conflictos.                                                                 |
| Fallos         | Estado confirmado separado del optimista; rollback al fallar, errores visibles, editores conservados y confirmaciones después del servidor.                                            |
| Finanzas       | Miembros reales, límites de importes, conservación de céntimos, validación de ajustes y vencimientos correctos en meses cortos.                                                        |
| Contexto       | Resolución de sesión sin efectos obsoletos, clientes ligados a su sesión, miembros actualizados tras cambios y entre dispositivos.                                                     |
| Experiencia    | Navegación adaptable, diálogos accesibles, acciones rápidas que abren editores, fechas actuales y agenda real.                                                                         |
| Consultas      | Paginación, filtros por hogar, finanzas bajo autorización, realtime filtrado y sondeo pausado en pestañas ocultas.                                                                     |
| Configuración  | Bucket privado reproducible, guía de migraciones, variables públicas de ejemplo, Bun congelado y CI.                                                                                   |
| Dependencias   | Actualizadas las cadenas vulnerables detectadas; auditoría del lockfile sin avisos.                                                                                                    |

## Validación

- Tipado, pruebas unitarias, ESLint, Prettier y build mediante `bun run check`.
- `scripts/test-database.py` aplica el historial y la migración a PostgreSQL 17 desechable y comprueba permisos, concurrencia, rollback y validaciones. No utiliza credenciales ni datos de usuarios reales.
- Playwright comprueba Auth, peticiones HTTP, creación, cambios, errores y recarga en escritorio y móvil con un backend sintético. Estos tests no sustituyen RLS real ni la entrega de correos.
- `scripts/validate-constraints.sql` permite validar las restricciones heredadas sin eliminar registros.

La política actual de finanzas mantiene plantillas recurrentes y ajustes mensuales; no representa movimientos bancarios. Los cambios en una plantilla afectan a los meses sin una excepción explícita y la interfaz lo explica. Un libro contable inmutable con cierres de mes sería una ampliación del modelo.

El propietario confirmó registro, inicio de sesión y recuperación por correo en producción. Las invitaciones por correo, el carrusel y la ceremonia passkey con QR/Bluetooth necesitan además una comprobación con los dispositivos reales. Se retiró por completo el dictado. Consulta los detalles de esta actualización en [Producción](production.md#actualización-de-uso-diario).
