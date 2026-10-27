# Skendal — Identidad y primera campaña

La marca pública elegida es **Skendal**, para familias de Estados Unidos, en inglés y español. Dirección B · En equipo. Símbolo elegido: casa con tres espacios organizados (Todo en su lugar). Colores: azul #344ED8, coral #FF8A70, lavanda #E8DDF5 y fondo #FAF7F2. Tipografía de aplicación web: Manrope, alojada localmente; licencia OFL en `site/assets/fonts/OFL.txt`. El símbolo PNG transparente deriva de la propuesta elegida; no se presenta como un archivo vectorial.

## Web

`https://skendal.com/` muestra inglés y `/es/` español. Las dos son páginas estáticas completas, con selección visible, metadatos y enlaces alternativos. El idioma de navegador orienta la primera visita al inicio; una elección manual se conserva si el navegador permite almacenamiento. Sin JavaScript, ambas páginas y sus enlaces funcionan. El contenido editable de origen es `branding/content.mjs`; `node scripts/build-site.mjs` genera los HTML con formato reproducible.

La web indica que la aplicación funciona actualmente en español. El nombre de instalación, el manifiesto, el icono de inicio y el título de la PWA ya usan Skendal. La localización inglesa de la app y el cambio de identidad en el resto de sus pantallas y correos siguen siendo una etapa posterior. No se presenta la web bilingüe como prueba de una app ya traducida. Las ilustraciones muestran datos de ejemplo identificados; no son capturas de hogares reales.

Los precios se leen del catálogo público existente. Se validan y se presentan como previstos, con cobros automáticos inactivos. La web no crea sesiones de pago. No se inventan planes, condiciones legales, reseñas ni cifras de usuarios.

## Kit para redes

`https://skendal.com/kit/` reúne tres temas: presentación, listas compartidas y tablet del hogar. Cada tema tiene inglés y español, publicación de 1080×1350, historia de 1080×1920 y vista de enlace de 1200×630. Incluye textos sugeridos y descripciones alternativas. En el editor, cambiar titular o texto actualiza la vista; los borradores se guardan localmente. PDF imprime el diseño actual. El enlace PNG descarga el original, incluso después de editarlo, y se etiqueta como tal. La copia del texto tiene alternativa de selección si el portapapeles no está disponible.

El kit es público y no indexable, sin datos privados ni permisos de administración. No envía textos, borradores ni correos a terceros. Las piezas se entregan para revisión y publicación manual, no se publican automáticamente en redes.

## Construcción y comprobación

```sh
bun run build:site
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium bun run export:brand
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium bun run test:site
```

Las exportaciones generadas no se versionan: el script reproduce 18 PNG y dos tarjetas para compartir a partir de fuentes, logo y tipografía versionados. Antes de desplegar `skendal-web`, ejecutar construcción y exportación. No desplegar esta carpeta sobre `skendal-app`.

## Contenido inicial

Mensaje de presentación: EN «Less to juggle. More time together.» / ES «Menos pendientes. Más tiempo juntos.» Tres demostraciones: organizar el inicio, compartir listas independientes y consultar tareas/fechas en la tablet. Mostrar situaciones concretas y responsabilidades compartidas. Evitar culpar a personas de la familia o prometer resolver conflictos personales. En inglés, incluir la disponibilidad actual en español en la pieza o su texto acompañante.

Propuesta orgánica inicial: publicar primero la presentación, después listas y luego tablet; adaptar cada pieza por idioma en publicaciones separadas. Pedir feedback a hogares voluntarios y observar si incorporan a otro miembro y vuelven durante la semana. El material no incorpora seguimiento publicitario ni requiere herramientas de pago.

## Iconos e instalación de la app

`bun run export:pwa` reproduce los PNG de instalación desde el símbolo aprobado, sin redibujarlo. Publica 192 y 512 píxeles, una variante maskable con el arte dentro del círculo seguro, Apple Touch de 180 y favicon de 32. Son opacos sobre el fondo de marca. Los enlaces de instalación usan rutas nuevas para renovar la imagen; `/icon.svg` y `/favicon.ico` conservan versiones actualizadas para clientes antiguos. El manifiesto mantiene URL, inicio y alcance; `id: "/"` coincide con la identidad anterior derivada de `start_url` y evita crear otra app para los navegadores compatibles. No cambiar ese identificador para refrescar una imagen.

El service worker consulta primero su propia caché. Las cachés anteriores solo sirven como respaldo para chunks de `/assets/` que todavía puede usar una pestaña abierta; no deben recuperar un manifiesto o icono viejo sobre el actual. No se eliminan datos de cuentas, preferencias ni colas de compras.

En Chrome para iPhone/iPad: abrir `https://app.skendal.com`, Compartir → Añadir a pantalla de inicio → Añadir. Los navegadores de terceros lo admiten desde iOS/iPadOS 16.4. Si aparece «Abrir como app web», mantenerlo activado. El sistema controla la actualización de los iconos ya instalados; no se garantiza una sustitución inmediata. Evitar borrar datos del navegador como solución al icono.

Fuentes: [Chrome](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DiOS&hl=es), [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
