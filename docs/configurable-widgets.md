# Widgets por selección

Petición del propietario del 29 de octubre de 2026, [M1 #54](https://github.com/HumbeMilano/codebase-revival/issues/54). Se atiende antes de las rutinas sin añadir nuevos tipos al catálogo.

| Widget             | Puede repetirse cuando cambia | No se puede repetir                       |
| ------------------ | ----------------------------- | ----------------------------------------- |
| Nota específica    | La nota                       | La misma nota                             |
| Lista de compras   | La lista                      | La misma lista                            |
| Resumen de miembro | El miembro                    | El mismo miembro en otro resumen          |
| Tareas de miembro  | El miembro                    | El mismo miembro en otro widget de tareas |
| Otros tipos        | No se repiten                 | El mismo tipo                             |

El resumen y las tareas de la misma persona pueden coexistir. El selector desactiva las opciones usadas; al quedar una opción libre la selecciona directamente. El primer añadido rellena una tarjeta sin configurar del mismo tipo, conservando su clave, tamaño y orden. Cada instancia tiene controles independientes de configuración, arrastre, tamaño y eliminación; cuando hay varias del mismo tipo los controles incluyen su selección.

Las referencias que ya no están disponibles conservan su espacio hasta elegir otra o retirar la tarjeta. Una nota o lista eliminada nunca se sustituye por otra automáticamente. La lista implícita de un diseño antiguo se vincula a su ID si es la única activa; antes de añadir otra lista se concreta esa elección. No se permiten simultáneamente una lista implícita y otra explícita.

## Guardado y compatibilidad

El documento versión 4 contiene solo tipos, claves únicas, tamaños e IDs opcionales de referencias. No guarda títulos, contenido de notas, nombres o importes. La unicidad es por tipo y referencia; los UUID de nota/lista se comparan sin distinguir mayúsculas y los identificadores de miembro conservan su distinción. La validación se aplica en el cliente y en `valid_dashboard_layout(jsonb)` antes del guardado con revisión. Un fallo o conflicto conserva el último diseño confirmado.

Las versiones 1–3 siguen siendo válidas en el servidor. Al leerlas, el cliente convierte a versión 4 sin escribir automáticamente, conserva orden/tamaño/claves y las distintas selecciones, y retiene la primera combinación si el formato 2 contenía duplicados exactos. Las claves locales anteriores permanecen intactas; las nuevas escrituras de tablet usan `homehub-dashboard-device:v4:<hogar>:<miembro>`. Una ventana antigua no puede reemplazar la preferencia versión 4.

El máximo técnico de 100 instancias acota la validación y el documento; no modifica los planes, cuotas comerciales ni su estado de activación. Se mantienen RLS por cuenta, revisiones y reintentos idempotentes. Los miembros de tablet usan únicamente preferencias locales separadas. Cada instancia financiera requiere la misma autorización financiera; añadirla no concede acceso.

## Verificación

- Las pruebas de esquema y hook comprueban selecciones distintas/duplicadas, normalización UUID, límites, compatibilidad, revisiones y aislamiento de almacenamiento.
- `e2e/configurable-widgets.spec.ts` comprueba añadir, reconfigurar, redimensionar, mover, quitar, guardar/recargar, abrir la nota correcta, marcar productos de la lista elegida y enmascarar todas las instancias financieras de una tablet sin permiso, con datos sintéticos en móvil y escritorio.
- `scripts/test-database.py` aplica todas las migraciones en PostgreSQL desechable y comprueba las mismas restricciones, permisos, reintentos y conservación del diseño tras un rechazo.
- Los resultados de CI, migración y publicación se registran en #54. Las pruebas de navegador con backend simulado no acreditan gestos físicos ni uso de un hogar real.

La petición posterior del propietario conserva las tarjetas financieras de tablet con máscara al vencer el permiso; véase [privacidad financiera en tablet](tablet-finance-privacy.md). El acceso financiero sigue dependiendo del PIN adulto verificado en el servidor.
