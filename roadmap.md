# Skendal — Hoja de ruta

Actualizada el 30 de octubre de 2026. Seguimiento activo: [M1 · Skendal v1: útil, confiable y listo para el público](https://github.com/HumbeMilano/codebase-revival/issues/34).

## Resultado que buscamos

Una familia puede empezar, coordinar compras, tareas y fechas, y seguir usando Skendal sin asistencia del desarrollador. Tener módulos o pruebas técnicas correctas no demuestra adopción ni disposición a pagar.

El [diagnóstico de producto](docs/product-readiness.md) distingue observaciones, hipótesis y trabajo pendiente. La [evidencia técnica](docs/product-readiness-evidence.json) documenta ocho recorridos de los archivos publicados con cuentas y datos simulados. No representa entrevistas ni una prueba con familias reales.

## Lo que ya existe

- App del hogar en `app.skendal.com` y PWA administrativa independiente en `admin.skendal.com`, con sesiones e instalaciones separadas.
- Cuentas, hogares, invitaciones por correo, recuperación, perfiles privados, tablet por QR/passkey y PIN verificado en el servidor.
- Tareas con archivo, listas independientes con cola durable sin conexión, notas, calendario y finanzas con autorización propia.
- Inicio personalizable, widgets que abren sus secciones, lista interactiva, agenda por día y preferencias guardadas.
- Fotos privadas, selección múltiple, carrusel y ajuste completo sobre fondo difuminado.
- Web EN/ES, identidad Skendal, kit de marketing, borradores legales y configuración editable de planes.
- Stripe sandbox verificado con Checkout, renovaciones, impago/recuperación, cambios y cancelaciones. No habilita dinero ni planes reales.

La app sigue en español, algunas comprobaciones nativas necesitan dispositivos físicos y la preparación legal/comercial no está terminada.

## M1: orden y entregables

P0 bloquea la finalización del hito. P1 requiere resolverse o diferirse explícitamente con una razón y alcance público actualizado. Una prioridad no implica una estimación de esfuerzo.

| Orden | Entregable                                               | Prioridad | Seguimiento                                                      |
| ----- | -------------------------------------------------------- | --------- | ---------------------------------------------------------------- |
| 0     | Auditoría independiente y criterios de salida            | P0        | [#35](https://github.com/HumbeMilano/codebase-revival/issues/35) |
| 1     | Confiabilidad de sesión y guardados; adaptar el PR #10   | P0        | [#36](https://github.com/HumbeMilano/codebase-revival/issues/36) |
| 2     | Primer resultado útil sin asistencia                     | P0        | [#37](https://github.com/HumbeMilano/codebase-revival/issues/37) |
| 3     | Inicio móvil y navegación estable al recargar o volver   | P0        | [#38](https://github.com/HumbeMilano/codebase-revival/issues/38) |
| 3a    | Widgets por nota, miembro o lista, sin repetir selección | P1        | [#54](https://github.com/HumbeMilano/codebase-revival/issues/54) |
| 4     | Rutinas/tareas y eventos recurrentes                     | P0        | [#39](https://github.com/HumbeMilano/codebase-revival/issues/39) |
| 5     | Avisos útiles fuera de la app                            | P0        | [#40](https://github.com/HumbeMilano/codebase-revival/issues/40) |
| 6     | Finanzas que separan estimaciones y confirmaciones       | P0        | [#43](https://github.com/HumbeMilano/codebase-revival/issues/43) |
| 7     | Calendarios existentes e importación/exportación privada | P1        | [#41](https://github.com/HumbeMilano/codebase-revival/issues/41) |
| 8     | Compra más rápida, cantidades y reutilización            | P1        | [#42](https://github.com/HumbeMilano/codebase-revival/issues/42) |
| 9     | Inglés/español completos y marca coherente               | P1        | [#44](https://github.com/HumbeMilano/codebase-revival/issues/44) |
| 10    | Valor Free/Pro, precio y sostenibilidad                  | P1        | [#45](https://github.com/HumbeMilano/codebase-revival/issues/45) |
| 11    | Empresa, edad, contratos y privacidad operativa          | P0        | [#46](https://github.com/HumbeMilano/codebase-revival/issues/46) |
| 12    | Soporte, respaldo/restauración y cuotas                  | P0        | [#47](https://github.com/HumbeMilano/codebase-revival/issues/47) |
| 13    | Prueba física y piloto privado de adopción               | P0        | [#48](https://github.com/HumbeMilano/codebase-revival/issues/48) |
| 14    | Posicionamiento, landing y demostración de valor         | P1        | [#49](https://github.com/HumbeMilano/codebase-revival/issues/49) |

Los contratos y el trabajo operativo pueden avanzar mientras se corrige el producto. Su apertura depende de empresa y decisiones del propietario, sin fechas de lanzamiento inventadas.

La petición del propietario del 29 de octubre (#54) quedó publicada antes de las rutinas. Permite varias notas específicas, listas y resúmenes/tareas de miembros si la selección es distinta; no amplía el catálogo. La misma persona puede tener un resumen y un widget de tareas, porque son tipos diferentes. Los widgets sin selección siguen siendo únicos. Los detalles y la compatibilidad están en [widgets configurables](docs/configurable-widgets.md).

La siguiente entrega de #37/#38 hace visible la cabecera del día también con diseños ya guardados y conecta la selección interna de notas, listas y calendario con su URL, incluido el regreso a la misma lista tras una recarga sin red. Las [capturas comparadas y reglas](docs/mobile-visible-polish.md) documentan el cambio; las pruebas físicas y de comprensión siguen abiertas.

## Cómo seguimos el hito

1. Tomar la siguiente tarea con dependencias listas y marcar el trabajo en su issue.
2. Enlazar cada PR a su tarea; respetar criterios de aceptación y alcance.
3. Registrar por separado pruebas técnicas, resultados publicados, comprobaciones físicas y uso de hogares.
4. Cerrar solo con evidencia del resultado. Si una parte depende de un dispositivo, del propietario o de un tercero, dejarla identificada y pendiente.
5. Actualizar la lista del hito maestro y sus bloqueos. Una tarea grande puede dividirse antes de implementarla.

El hito está registrado como issue maestro con tareas enlazadas. No existe todavía un objeto Milestone nativo: el conector disponible no ofrece su creación. Si se crea desde una sesión autorizada, asociar estas mismas tareas y conservar el issue maestro como índice.

## Condiciones para abrir al público

- El propietario mantiene empresa constituida como condición previa al lanzamiento.
- Cuentas desde 13 años; administración del hogar y contratación desde 18; autorización de responsables para adolescentes.
- Planes Free de infraestructura dentro de sus cuotas. Sin ampliaciones, cargos, publicación de contratos o límites comerciales automáticos.
- Free/Pro propuestos conservan 10/30 fotos y precios editables de USD 2.99/mes o USD 5.99/año hasta una decisión explícita. Validar sostenibilidad antes de vender.
- Retención y consentimiento medidos con un piloto autorizado. Ningún contacto, invitación o campaña se envía desde esta planificación.

La guía legal está en [preparación de lanzamiento](docs/legal/launch-readiness.md). La separación de PWA está en [instalaciones independientes](docs/independent-pwas.md).

## Decisiones que se conservan

No se restauran tour, dictado web/modelos de voz ni carteles explicativos de funcionamiento. La personalización sigue siendo opcional; los diseños guardados y las colas sin conexión se preservan. La primera prioridad es reducir trabajo manual y aumentar confianza, antes de ampliar widgets o añadir otros módulos.
