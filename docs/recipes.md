# Recetas del hogar

Recetas se abre desde el menú lateral o Más → Recetas. Una cuenta adulta puede crear recetas manualmente, importar un borrador de ChatGPT, editar y archivar/restaurar. Los demás miembros y las tablets vinculadas tienen acceso de consulta.

En la pantalla bloqueada: un toque muestra la información; **Recetas** abre el recetario sin pedir PIN. Consultarlo no desbloquea el hogar ni concede permiso financiero. Permanece abierto mientras se cocina; al cerrarlo vuelve la información y, tras diez segundos, las fotos. La foto inicial, el ajuste de orientación y el PIN conservan su funcionamiento.

## Formato para ChatGPT

Recetas → Con ChatGPT → Copiar instrucciones. Pegar las instrucciones en ChatGPT, sustituir la idea final y copiar el JSON resultante. Pegar la respuesta o elegir su archivo `.json`, pulsar Revisar receta y revisar el formulario antes de Guardar receta. La plantilla completa vive en `src/lib/recipes.ts`.

```json
{
  "version": 1,
  "name": "Nombre de la receta",
  "description": "Descripción breve",
  "servings": 4,
  "prep_minutes": 15,
  "cook_minutes": 25,
  "ingredients": [{ "name": "Nombre del ingrediente", "quantity": "200", "unit": "g" }],
  "steps": ["Primer paso completo", "Segundo paso completo"],
  "nutrition": { "calories_kcal": 450, "protein_g": 30 },
  "source": ""
}
```

Ingredientes/cantidades corresponden al total preparado; calorías y proteínas son estimaciones **por una porción**. `null` significa desconocido y no se sustituye por cero. Cantidades y unidades son texto para admitir fracciones. Las fotos se seleccionan después de guardar; el JSON no acepta enlaces de imágenes, adjuntos ni campos desconocidos. Se admite JSON sin envoltorio o dentro de un bloque `json` de ChatGPT. Nunca se interpreta como HTML o código. El texto importado está limitado a 64 KiB UTF-8 y pasa por el mismo formulario/validación que la captura manual.

No se llama a una API de IA ni se envían datos del hogar automáticamente a ChatGPT. El propietario decide qué pega allí. La función no añade un servicio de pago.

## Persistencia y permisos

- `recipes` guarda contenido estructurado, hogar, revisión y fechas. Las mutaciones `save_recipe`/`archive_recipe` verifican adulto de cuenta, pertenencia y suspensión bajo el bloqueo del hogar. Las escrituras directas de clientes están revocadas. Un guardado con respuesta perdida reusa el mismo UUID/contenido; una revisión antigua no sobrescribe cambios ajenos. El borrador conserva sus datos ante errores.
- RLS limita recetas/fotos al hogar. Las archivadas quedan visibles solo para adultos de cuenta; conservan contenido e imágenes, y no se muestran en el bloqueo. Archivar no borra datos.
- La selección de una receta en la app utiliza la URL y el historial. El lector bloqueado conserva la selección solo en memoria. No se ponen títulos, pasos ni información nutricional en enlaces.
- La consulta requiere conexión y se actualiza al recuperar foco y periódicamente mientras está visible. Compras conserva su cola offline independiente; no se promete captura de recetas sin conexión.
- La sección tiene topes técnicos defensivos: 200 recetas conservadas por hogar, cuatro fotos por receta y 2 MiB por imagen comprimida. No se cambian los planes comerciales ni se activan cuotas o cobros de Pro.

## Fotos privadas

`recipe_photos` mantiene metadatos separados del carrusel de bloqueo. El bucket `recipe-photos` es privado. Solo una cuenta adulta puede subir/comprobar/quitar objetos bajo `hogar/receta/UUID.jpg`; no se amplían las políticas de fotos del hogar o avatares.

La Edge Function `recipe-photos` valida `my_context()` en cada solicitud y consulta metadatos filtrados por RLS. Solo después firma rutas registradas del hogar solicitado por su identidad; no firma rutas recibidas del cliente. Usa la clave de servicio únicamente dentro del runtime y URLs de cinco minutos. Los dispositivos revocados y hogares suspendidos pierden acceso. `verify_jwt=false` permite el token de tablet y exige esta autenticación propia; no es lectura pública.

La selección múltiple comprime/sube secuencialmente. Reintentos conservan rutas y recibos, sin volver a subir fotos confirmadas. Al salir/cambiar cuenta se descartan bytes y URLs en memoria; no se almacenan en preferencias, localStorage, IndexedDB o caché del service worker. La preparación conserva las reglas de derechos sobre imágenes y añade atribución opcional por receta. Las operaciones de privacidad/retención previas al lanzamiento deben incluir estas dos tablas y el nuevo bucket.

## Verificación

Pruebas de SQL en base desechable: permisos de adulto/miembro/tablet/otro hogar/anónimo, suspensión/revocación, idempotencia, revisiones, validación, bucket privado, topes de fotos y archivo/restauración. Pruebas de navegador con Auth/datos sintéticos: importación/revisión, errores y respuesta perdida, selector múltiple/reintento, lectura bloqueada y temporizador, historial/recarga, conflicto y acceso de consulta. Las verificaciones físicas y con hogares de M1 siguen separadas.
