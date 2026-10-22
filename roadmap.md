# Roadmap

## Aplicación actual

HomeHub ofrece cuentas personales, hogares, invitaciones, tablets vinculadas, acceso por PIN, tareas, compras, calendario, notas, finanzas compartidas y preferencias privadas de perfil. La administración del servicio tiene un rol separado. El repositorio está conectado a Lovable; el código y las migraciones deben mantenerse coordinados.

## Estabilización

El trabajo de corrección cubre la revisión del 22 de octubre de 2026:

- Restringir la creación del primer administrador de plataforma a una operación del propietario.
- Compartir el límite de intentos de PIN entre entrada y autorización financiera.
- Serializar cambios de miembros y conservar al menos un adulto.
- Guardar facturas, repartos y ajustes de forma atómica; rechazar escrituras obsoletas.
- Reconciliar los guardados optimistas fallidos y mostrar sus errores correctamente.
- Exigir miembros válidos del hogar y repartos que conserven el importe.
- Aplicar la suspensión a tablas y RPC.
- Caducar y revocar las autorizaciones financieras.
- Mantener reactivo el contexto de sesión y miembros, descartando respuestas obsoletas.
- Sustituir marcos de preview, fechas fijas y contenido de demostración por flujos funcionales adaptables.
- Provisionar el almacenamiento privado y hacer reproducible la instalación.
- Actualizar dependencias vulnerables y ejecutar comprobaciones en CI.

La finalización requiere comprobaciones de código y regresiones de base de datos/navegador aisladas. La validación del despliegue se registra por separado.

## Verificación del despliegue

- [ ] Confirmar la migración de corrección en el proyecto correcto y revisar los avisos de seguridad/rendimiento de la base.
- [ ] Verificar registro confirmado, invitación y recuperación de contraseña en el dominio publicado.
- [ ] Verificar subida/eliminación de avatar privado y rechazo del acceso desde otra cuenta.
- [ ] Verificar permisos adulto/hijo, caducidad de autorización financiera y revocación al salir sobre la API real.
- [ ] Verificar dos dispositivos reales, reconexión, cambios de cuenta/rol, revocación de tablet y suspensión del hogar.
- [ ] Probar diseño, teclado, micrófono, descarga de Whisper y transcripción en iPad/Safari y Android.
- [ ] Ensayar la restauración de base de datos, Auth y configuración de Storage.

## Decisiones de producto

- Definir límites de planes, precios y proveedor de pago antes de implementar suscripciones o cargos.
- Decidir la política del historial financiero: obligaciones mensuales, pagos inmutables y correcciones explícitas si se necesita conservar contabilidad histórica.
- Definir cierre de cuenta, salida del hogar, transferencia de responsabilidad y retención antes de exponer acciones irreversibles.
- Recoger resultados del dictado en dispositivos reales antes de ampliar idiomas o modelos.
