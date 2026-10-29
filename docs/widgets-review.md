# Revisión de widgets

`public/widgets-lab.html` es el laboratorio independiente solicitado para decidir los widgets antes de trasladar los cambios a la aplicación. Se abre directamente como HTML y en `/widgets-lab.html` al publicar la SPA. No necesita dependencias ni servicios externos.

El prototipo conserva los 16 tipos originales y «Lista específica», uno de cada tipo. Los datos de ejemplo están identificados y no se consultan ni modifican los datos del hogar. Las preferencias de producción y sus migraciones permanecen separadas de esta revisión.

La barra lateral permite editar, añadir, revisar uno a uno y compartir las indicaciones. Las tarjetas informativas no completan tareas ni modifican productos. Calendario permite explorar meses y «Crear algo» modifica únicamente ejemplos del laboratorio. En edición, un dedo arrastra o redimensiona y dos dedos desplazan sobre la propia superficie de los widgets. También hay controles de tamaño y orden para teclado.

Cada widget tiene tamaño, referencias de ejemplo cuando corresponde, estado de revisión y comentarios. Hay indicaciones generales. La revisión se conserva en el navegador bajo `skendal-widget-review:v1`; no llega automáticamente al chat. «Copiar revisión», compartir o descargar permite enviarla. La importación valida los tipos, tamaños y unicidad, y no ejecuta el contenido de los comentarios. Restablecer la disposición conserva las indicaciones.

Las fotos y el fondo quedan fuera de esta revisión, a la espera de la explicación del propietario.

## Integración aprobada (24 de octubre de 2026)

La aplicación incorpora el diseño revisado, tarjetas informativas, edición lateral y 12 tamaños. En producción, el desplazamiento usa un dedo sobre el cuerpo de las tarjetas y el arrastre empieza únicamente en el botón de puntos, después de pulsar «Personalizar». La esquina conserva el cambio de tamaño y las flechas del teclado permiten mover desde el botón de puntos. Se retiraron la captura de toda la tarjeta y el scroll personalizado con dos dedos tras la prueba en la tablet del propietario. El catálogo de producción ofrece 20 tipos: los 16 originales más tareas de miembro, recordatorios, próximo vencimiento y resumen de compras. «Lista de compras» muestra una lista elegida; pregunta cuál antes de añadir cuando hay varias y selecciona automáticamente la única lista disponible. Su configuración permite cambiarla posteriormente. El resumen financiero de miembro muestra el porcentaje aportado sobre su asignación mensual, incluso en los tamaños pequeños.

La disposición inicial y «Restablecer diseño» usan las seis tarjetas y dimensiones del archivo aprobado. No se copian las referencias ficticias del prototipo ni se sustituyen preferencias ya guardadas. El formato 3 contiene únicamente tipos, claves, tamaños y referencias; los formatos 1 y 2 se cargan conservando el primer widget de cada tipo y sus elecciones. Las antiguas claves locales se conservan y las nuevas escrituras usan `homehub-dashboard-device:v3`. Las preferencias por cuenta siguen usando RLS, revisiones y reintentos idempotentes. Ningún diseño concede acceso a finanzas; los widgets y sus datos se ocultan también si la autorización vence durante la edición.

El laboratorio sigue siendo independiente y sus comentarios no modifican las preferencias ni los registros del hogar.

## Selecciones independientes (29 de octubre de 2026)

La nueva petición del propietario sustituye en producción la regla de uno por tipo para los widgets configurables. Se permite uno por cada nota específica, lista o miembro; el mismo tipo no puede repetir la misma selección. Los tipos genéricos siguen siendo únicos. El formato 4 conserva las claves, tamaños, posiciones y selecciones anteriores y escribe las preferencias locales nuevas en `homehub-dashboard-device:v4`, sin borrar las claves antiguas. Véase [reglas, compatibilidad y verificación](configurable-widgets.md) y [tarea M1 #54](https://github.com/HumbeMilano/codebase-revival/issues/54).

La versión histórica del laboratorio conserva su formato independiente; no se importa sobre las preferencias del hogar.
