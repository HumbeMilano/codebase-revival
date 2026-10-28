# Producción de Skendal / HomeHub

El alojamiento nuevo debe mantenerse en $0 dentro de las cuotas Free. El dominio `skendal.com` ya pertenece al propietario y su renovación se paga aparte.

| Recurso             | Destino                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Código y CI         | `HumbeMilano/codebase-revival`                                                             |
| Aplicación          | `https://app.skendal.com`, Worker `skendal-app` con archivos estáticos                     |
| Web de presentación | `https://skendal.com`, Worker `skendal-web` con archivos estáticos                         |
| Backend             | Supabase `skendal-homehub`, referencia `rwbeiestzyzceramgtdw`, organización `homehub` Free |
| Correo              | Resend, dominio verificado `mail.skendal.com`, plan Free                                   |

Las conexiones de Cloudflare, Supabase y Resend son las de Skendal. GitHub utiliza Milano. El proyecto anterior de Supabase `HomeHubV2` y el backend de Lovable quedan separados y no se reutilizan para esta instalación vacía.

## Instalación de un backend nuevo

Solo para un proyecto Supabase nuevo, sin cuentas ni datos de aplicación:

```sh
python3 scripts/prepare-empty-database.py --owner-email correo-del-propietario@example.com /tmp/homehub-install.sql
# Revisar /tmp/homehub-install.sql y aplicarlo una sola vez desde la conexión administrativa del proyecto correcto.
```

La transacción aplica las migraciones históricas sin modificarlas, elimina su hogar de ejemplo antes de activar las nuevas restricciones y registra cada SHA-256 y fecha en `drizzle.__drizzle_migrations`. Incluye las migraciones nuevas y valida las restricciones. Si hay cuentas o esquema de aplicación existentes, falla antes de cambiar datos. No utilizar este instalador para actualizaciones ni ejecutar un schema push desde los snapshots históricos de Drizzle.

En esta instalación, el propietario indicó empezar vacío y designó su dirección para la lista privada de administración. No se crean usuarios ni contraseñas. La persona debe registrarse y confirmar ese correo; el trigger privado aprovisiona entonces `platform_admin`. La lista no es accesible a clientes anónimos ni autenticados. Un correo distinto o no verificado conserva los permisos normales.

## Configuración pública y build

Copia `.env.example` a `.env.local`, usa la URL y la clave publicable del proyecto correcto y ejecuta:

```sh
bun install --frozen-lockfile
bun run check
python3 scripts/test-database.py
python3 scripts/test-database.py --empty-install
bun run test:e2e
```

`dist/` contiene la aplicación y `site/` la web. Los archivos `wrangler*.jsonc` describen los despliegues. `worker-dist/app.js` contiene el servidor de invitaciones y se publica como módulo privado del Worker. `prepare-static.mjs` rechaza archivos de más de 25 MiB y genera el service worker de la app. El dictado y sus modelos se retiraron por petición del propietario.

Las publicaciones pueden realizarse con Wrangler usando una credencial de despliegue del propietario o mediante la conexión de Cloudflare y su API de subida de archivos. La CI de GitHub verifica el código; una publicación necesita la conexión autorizada al destino. No introducir tokens de despliegue o SMTP en el código ni en variables `VITE_*`.

## Activación de Supabase Auth

El conector de Supabase disponible permite gestionar SQL y funciones, pero no modificar SMTP ni la configuración de URLs de Auth. Estos campos se completan en el dashboard del proyecto de destino:

- **Site URL:** `https://app.skendal.com`.
- **Redirect URLs:** `https://app.skendal.com/**`. Durante la revisión puede añadirse `https://skendal-app.skendalapp.workers.dev/**` y retirarse después.
- **Confirm email:** activado.
- **Custom SMTP:** activado con host `smtp.resend.com`, puerto `465`, usuario `resend` y una API key de Resend limitada al envío desde `mail.skendal.com`.
- **Sender email:** `no-reply@mail.skendal.com`.
- **Sender name:** `HomeHub · Skendal`.

La clave SMTP se crea y se guarda en Resend/Supabase, nunca en el frontend. Los registros SPF, DKIM y Return-Path pertenecen al subdominio de envío; no se sustituyen los MX del dominio raíz. Se desactiva el seguimiento de aperturas y clics en enlaces de autenticación.

Durante el lanzamiento del 22 de octubre de 2026, el propietario completó SMTP y las URLs en Supabase. Se comprobó que el registro exige confirmar el correo y que la cuenta designada, una vez confirmada, obtuvo el rol protegido de administrador. El propietario confirmó el inicio de sesión en `app.skendal.com` y la recuperación de contraseña mediante el correo, incluido el acceso con la contraseña nueva.

Verificar con una cuenta real: registro y confirmación, inicio y cierre de sesión, recuperación de contraseña, creación de hogar, invitación, avatar privado, una segunda sesión, vinculación y revocación de tablet y autorización financiera por PIN. La cámara del móvil y la verificación biométrica de la vinculación QR deben comprobarse con el móvil y la tablet reales. Las pruebas locales con backend sintético no prueban la entrega de correos.

## Límites del presupuesto gratuito

Usar exclusivamente planes Free. Los archivos estáticos se sirven sin ejecutar SSR; no se provisionan almacenamiento R2, bases de pago ni APIs de IA. Supabase Free aplica cuotas de base de datos, archivos, transferencia y conexiones, y puede pausar proyectos con poca actividad. Resend Free aplica cuotas de envío. El agotamiento de cuotas puede interrumpir el servicio; no activa una ampliación de pago autorizada.

Las copias gestionadas, retención avanzada y garantías de disponibilidad de los planes de pago no están incluidas. Conservar exportaciones controladas por el propietario según la importancia y evolución de los datos. No presentar la aplicación como un sistema bancario: los gastos son registros y plantillas del hogar.

## Actualización de uso diario

La migración `20261022205610_household_daily_use.sql` añade fechas de aportes y finalización de tareas, invitaciones ligadas al correo, recibos de reintentos de compras, metadatos de fotos y vinculación mediante passkey. No ejecutar el instalador vacío para actualizar una instalación existente. Aplicar únicamente las migraciones pendientes y registrar su SHA-256 y fecha de origen en `drizzle.__drizzle_migrations`, además del historial nativo de Supabase. Las tareas antiguas ya completadas reciben la fecha de actualización y conservan 72 horas de visibilidad; las fechas desconocidas de aportes históricos permanecen sin inventar.

`20261022215736_household_photo_permissions.sql` retira también el permiso explícito de ejecución anónima que Supabase concede por defecto a las funciones nuevas de gestión de fotos. La validación interna sigue exigiendo una cuenta adulta. La base desechable reproduce estos permisos predeterminados para comprobar tanto el rechazo por permisos como la autorización dentro de cada RPC. Los tipos de Supabase se regeneraron desde el esquema desplegado.

**Servidor de invitaciones:** el Worker usa `SUPABASE_URL`, `SUPABASE_PUBLIC_KEY` y el secreto `RESEND_API_KEY`, limitado al envío desde `mail.skendal.com`. Guardar este último con la API de secretos de Cloudflare o `wrangler secret put RESEND_API_KEY`; nunca añadirlo a Git, `.env.example`, `VITE_*` o a archivos estáticos. Conservar los bindings de tipo `secret_text` al publicar mediante API. La ruta `/api/*` ejecuta el Worker antes de los assets. La API comprueba el JWT y delega la autorización de adulto y los límites a Postgres (20 intentos por hora y hogar, un minuto entre intentos de la misma invitación). Un fallo deja la invitación pendiente; los reintentos de entrega incierta son idempotentes y un reenvío solicitado tras un envío confirmado obtiene una nueva identidad de entrega. La etiqueta «enviada» significa aceptada por el proveedor; no garantiza lectura ni llegada a bandeja principal.

**Vinculación por QR:** abrir `https://app.skendal.com/vincular` en la tablet, o elegir Tablet en la bienvenida. Escanear el QR con la cámara del teléfono, entrar con una cuenta adulta si hace falta y pulsar Vincular tablet. La verificación passkey ocurre en el teléfono, con registro integrado para la primera vez. La tablet se vincula automáticamente y muestra la pantalla de PIN. El QR de la aplicación no comprueba proximidad por Bluetooth. Auth Passkeys usa RP ID `app.skendal.com` y origen `https://app.skendal.com`.

La migración `20261022225312_qr_pairing_and_guided_tour.sql` añade solicitudes de 5 minutos con secretos de aprobación y entrega independientes. Solo el secreto de aprobación viaja en el fragmento del enlace; el secreto de entrega permanece en la tablet. El servidor exige una cuenta adulta activa y verificación passkey reciente en una sesión Auth vigente. La aprobación consume esa sesión para una única vinculación; la entrega revalida membresía y suspensión bajo el bloqueo del hogar, crea un solo dispositivo y permite reintentos con la misma credencial. El móvil conserva su sesión personal; la tablet no la recibe.

Configurar una clave aleatoria de 256 bits distinta de otras credenciales como secreto `TABLET_PAIRING_KEY` del Worker. Guardar **solo su SHA-256 hexadecimal** mediante una operación administrativa en `homehub_private.tablet_pairing_keys(key_hash)`. Nunca usar un prefijo `VITE_` ni incluir la clave en Git. El Worker `/api/tablet-pairing` aplica el binding `TABLET_PAIRING_RATE` (aproximadamente 5 solicitudes/minuto por IP y ubicación de Cloudflare); la RPC de creación rechaza clientes que no tengan la clave privada. El límite global de solicitudes pendientes es 500. Mantener el plan Free y conservar `RESEND_API_KEY` al publicar el Worker.

**Fotos y teclado nativo:** la migración `20261022234616_fix_photo_storage_and_remove_tour.sql` corrige las políticas INSERT/DELETE de Storage: usan `is_household_admin()` para consultar de forma autorizada la membresía privada, sin exponer `household_accounts` al cliente. La subida conserva una ruta única entre reintentos y el registro de metadatos es idempotente. La eliminación comprueba primero los metadatos si hubo una respuesta incierta. El bucket sigue privado y no admite modificación de archivos existentes.

El recorrido inicial se retiró por petición del propietario, junto con su botón, preferencias y RPC. Los atajos «Escribir o dictar» enfocan campos de texto para abrir el teclado del dispositivo; el usuario inicia el dictado desde el micrófono de ese teclado cuando está disponible. La app no captura audio ni activa servicios de reconocimiento.

**Fotos:** desplegar `supabase/functions/household-photos/index.ts`. Su `verify_jwt=false` es intencionado para las tablets anónimas: la función verifica `my_context()` y la lista de fotos autorizadas antes de usar la clave de servicio del runtime para firmar únicamente rutas del propio hogar. El bucket `household-photos` es privado. Los adultos pueden subir, ordenar y quitar hasta 30 fotos desde la sección Fotos (capacidades propuestas: Free 10, Pro 30; mientras los límites están desactivados rige el máximo técnico de 30) JPG/PNG/WebP, comprimidas a un máximo de 1600 píxeles y 2 MiB. La tablet rota cada 20 segundos, permite pausar y respeta movimiento reducido. La caché de imágenes vive en memoria, ligada al cliente y hogar: muestra la primera foto decodificada antes de descargar las restantes y se mantiene preparada al desbloquear la tablet. Se limpia y revoca sus object URLs al cambiar de contexto o denegarse la autorización. No se guardan fotos ni enlaces firmados en localStorage o IndexedDB. Los enlaces firmados caducan a los cinco minutos.

**Subida múltiple:** el selector nativo admite varias imágenes. Antes de una nueva selección consulta la capacidad y los metadatos del servidor; si el grupo no cabe, no sube ninguna. Comprime y guarda una imagen a la vez, libera los archivos ya confirmados y conserva en memoria los recibos de las pendientes para reintentar sin duplicados, incluso si una respuesta perdida ya ocupó el último espacio. Cada lote está ligado a la cuenta, cliente y hogar originales; se detiene al cerrar la sección o cambiar de sesión. No persiste archivos, nombres originales ni el lote en almacenamiento local.

**Bloqueo fotográfico:** arranca solo con las fotos reales, sin la imagen de muestra. El primer toque muestra hora, fecha, clima y próximos eventos; el segundo abre el teclado propio del PIN. Tras 10 segundos sin interacción en la información, vuelve a las fotos. El PIN conserva su cancelación y verificación de servidor. La foto frontal usa `object-fit: contain`; una copia ampliada y difuminada llena el fondo sin cortar la imagen principal en retrato o paisaje.

**Clima:** `/api/weather` obtiene la zona aproximada de la conexión desde `request.cf`, redondeada a una cuadrícula de 0.1 grados. Consulta Locationforecast de MET Norway desde el servidor con identificación de la aplicación y atribución CC BY 4.0. El contenido de la consulta contiene la cuadrícula; la aplicación no copia las cabeceras de autorización entrantes ni envía tokens, fotos o identificadores del hogar. No solicita GPS ni almacena ubicación en perfiles. Usa Cache API de Cloudflare por cuadrícula, respeta `Expires` y revalida con `If-Modified-Since`; la respuesta con nombre de ciudad es privada y no se almacena en caché compartida. El binding Free `WEATHER_RATE` (namespace `2026102401`) limita a 10 solicitudes/minuto por IP. No requiere claves ni servicios de pago. Si no hay geolocalización de conexión o falla la fuente, muestra «Clima no disponible», sin valores inventados. La interfaz expresa grados Celsius y consulta la actualización cada 15 minutos mientras está visible.

**Compras sin internet:** abrir la app con la cuenta personal y conexión al menos una vez en ese navegador. El service worker conserva la aplicación y las compras se guardan en IndexedDB, separadas por cuenta, hogar y miembro. Se puede añadir, marcar y quitar productos incluso tras recargar sin red. Al reconectar se valida otra vez el acceso antes de transmitir la cola. Si otro dispositivo modificó el mismo producto, elegir «Aplicar mis cambios» o «Usar la lista del hogar»; no se descartan cambios silenciosamente. Una cola de más de 14 días requiere revisión. No borrar los datos del navegador mientras haya cambios pendientes; el almacenamiento local puede perderse al desinstalar o borrar datos y el modo privado puede limitarlo. Las finanzas no se almacenan para uso sin conexión. La tablet compartida mantiene sus controles de PIN y requiere conexión.

**Pantalla completa:** el bloqueo ocupa todo el viewport, sin marco de vista previa. Safari conserva sus propias barras cuando se abre en una pestaña; para el modo independiente, usar Compartir → Añadir a pantalla de inicio. La app muestra un aviso cuando hay una versión nueva para que se recargue después de guardar los formularios.

**Inicio personalizable:** `20261023065110_personal_dashboard_layout.sql` crea `dashboard_preferences`, una fila privada por `auth.users.id`. Las políticas RLS y los permisos explícitos permiten que cada cuenta consulte y guarde solo su propio diseño. `save_dashboard_layout` es `SECURITY INVOKER`: valida la versión, IDs únicos y tamaños del catálogo de widgets; compara la revisión y devuelve un recibo idempotente si se repite una respuesta incierta. Ante un conflicto se mantiene el editor y se permite cargar el diseño actual sin sobrescribirlo. Las preferencias nunca incluyen registros del hogar ni importes.

En una tablet vinculada no existe sesión Auth personal: el diseño se guarda localmente, separado por hogar y miembro, con bloqueo entre ventanas cuando el navegador lo admite. Solo se confirma el guardado después de que el almacenamiento acepte el cambio. Las cuentas recuperan su diseño al abrir el inicio, volver a la ventana o reconectar. Los widgets usan los datos existentes y no añaden suscripciones, servicios ni cargos. El widget de finanzas permanece oculto sin la autorización actual, incluso si su ID figura en un diseño guardado.

Los tipos de bindings del Worker se generan con `bun x wrangler types workers/env.d.ts --env-interface WorkerEnv --strict-vars=false`; regenerarlos cuando cambie `wrangler.jsonc`. Los tests de navegador construyen y sirven la versión de producción con backend sintético, incluida la instalación del service worker y una recarga sin conexión. No envían correos reales ni simulan una validación criptográfica de una passkey física.

## Inicio con gestos, listas independientes y consola de negocio

Los iconos personales usan un único almacén de avatares del hogar, compartido por la cabecera, tareas, calendario, finanzas, miembros y widgets. Desplegar `supabase/functions/member-avatars/index.ts` con `verify_jwt=false`: autoriza cada cuenta o tablet mediante `my_context()` y consulta `household_avatar_paths()` antes de firmar rutas privadas durante cinco minutos. La función no acepta rutas del navegador. Los perfiles y las políticas de escritura/lectura directa de Storage siguen limitados a su propietario; el bucket permanece privado. Las imágenes decodificadas se guardan solo en memoria, separadas por cliente y hogar, se revocan al cambiar de contexto o denegarse el acceso y se reutilizan en todos los iconos. Subir o quitar una foto refresca los iconos locales; los demás dispositivos revalidan cada minuto mientras están visibles. Una imagen ausente conserva la inicial de su miembro. No se guardan fotos, rutas o enlaces firmados en preferencias ni en la caché de compras.

Las migraciones del 23 de octubre `flexible_dashboard_widgets`, `multiple_shopping_lists`, `business_operations_console` , `stripe_sandbox_gateway` y `shopping_realtime_and_public_catalog` amplían el catálogo a doce widgets con tres tamaños, crean listas independientes preservando los artículos y outboxes anteriores, y añaden la configuración comercial y los registros privados de pagos y auditoría. Las versiones originales del diseño siguen siendo válidas. Las preferencias existentes no se restablecen ni se añaden widgets nuevos automáticamente.

En Inicio, usar Personalizar. Arrastrar únicamente desde el botón de puntos para ordenar y estirar la esquina para ampliar; un toque en la esquina alterna tamaños. El cuerpo de la tarjeta permite scroll nativo con un dedo; las flechas del teclado sobre el botón de puntos ofrecen una alternativa. Guardar confirma el diseño; Cancelar conserva el anterior. Los movimientos cancelados devuelven la posición inicial y se respeta la preferencia de movimiento reducido.

Compras ofrece listas propias (la inicial se llama Groceries), con creación, cambio de nombre y archivado reversible. Los artículos se deduplican por lista. Las listas y productos de cuentas personales se guardan en la misma cola durable, sin cambiar el nombre ni la versión del almacén IndexedDB anterior. Los cambios pendientes anteriores a la actualización siguen usando su contrato de sincronización original. La lista inicial puede renombrarse; se mantiene activa para que las colas antiguas siempre tengan un destino.

La web pública usa archivos sin dependencias en `site/`, muestra las funciones reales y consulta un catálogo público mínimo para reflejar los precios editables. La cuenta maestra entra por `/admin` sin pasar por la creación o selección de un hogar. Véase [Operación del negocio](business.md) para precios, pruebas de Stripe y lo pendiente antes de cobrar en producción.

Para cambiar el correo vinculado a un miembro conservando su historial, una conexión de gestión puede llamar a `homehub_private.prepare_member_account_change(hogar, clave_miembro, nombre, correo_nuevo, propietario_plataforma)`. Solo acepta un propietario verificado de la lista privada y no se expone al navegador. Devuelve una invitación ligada al perfil existente y al estado de sus cuentas; no cambia la dirección Auth de la cuenta administrativa. El correo nuevo se registra, verifica y acepta por el flujo normal. La aceptación sustituye los vínculos de acceso, actualiza el nombre y PIN, conserva el UUID/clave del miembro, revoca las autorizaciones financieras anteriores y copia el diseño de Inicio si la cuenta nueva no tiene uno. Los roles de plataforma permanecen en sus cuentas originales. El acceso anterior al hogar se mantiene hasta la aceptación, y los cambios concurrentes del perfil invalidan la invitación. Confirmar la entrega mediante `homehub_private.confirm_member_account_invite_delivery(codigo, id_entrega, recibo_proveedor)` después de que el proveedor acepte el mensaje; mantener el id de entrega como clave de idempotencia para reintentos inciertos. Nunca escribir códigos, PIN, contraseñas o identificadores reales en las migraciones.

### Inicio del teléfono y navegación de widgets

El teléfono y la tablet conservan las mismas tres columnas y tamaños en la vista y en Personalizar. Las preferencias guardadas mantienen sus IDs, orden, referencias y tamaños; los registros mostrados nunca redimensionan ni recolocan las tarjetas. El inicio móvil sin preferencias elige explícitamente resúmenes, lista, agenda, notas y calendario en esa misma cuadrícula.

Los títulos y el cuerpo informativo de cada widget abren su sección. Los controles anidados siguen actuando en el dashboard: productos de la lista elegida, notas y calendario. La fecha abre la agenda del día mediante `FamilyCalendar` en modo de diálogo; eventos y recordatorios usan sus setters persistidos, y las facturas mantienen sus registros y autorizaciones de finanzas. Los gestos de edición y las pulsaciones largas no abren secciones.

**Recuperación de contraseña:** `/reset-password` reúne solicitud, confirmación del envío, contraseña nueva y continuación al hogar. El cliente captura la intención del enlace antes de que Auth limpie su fragmento y verifica la sesión con el servidor. Un marcador de una hora en sessionStorage, ligado a cuenta y sesión, permite recargar el formulario; no contiene tokens, correo ni contraseña y no se renueva al recargar. Los enlaces caducados permiten solicitar otro desde la misma página y los redirects antiguos a `/#type=recovery` se encaminan al formulario. La actualización utiliza un cliente Auth temporal ligado a la sesión verificada, para que un acceso en otra pestaña no cambie la cuenta destinataria. Las pruebas del navegador interceptan Auth; el envío y la apertura de un correo real siguen siendo una comprobación manual del propietario.

**PIN y autoguardado:** alta, invitación y edición de miembros eligen su PIN con un teclado de botones y puntos, sin inputs de contraseña, texto ni campos ocultos. Confirmar el PIN solo actualiza el formulario; crear/guardar el hogar o miembro conserva su confirmación y validación de servidor. El acceso personal, la administración y la aprobación de tablets identifican explícitamente el correo como `username` y su contraseña como `current-password` o `new-password`; recuperación muestra el correo verificado para asociar el cambio a la cuenta correcta. La app no puede eliminar ni corregir entradas que el gestor del teléfono ya haya guardado. Las pruebas automáticas comprueban los formularios y sus solicitudes; la interfaz nativa del gestor requiere comprobación en el dispositivo.

**Cuadrícula del inicio:** vista y editor usan las mismas tres columnas, tamaños y colocación. Las dimensiones guardadas no se sustituyen según el tipo de widget ni cambian con la cantidad de registros. El diseño inicial del teléfono elige tamaños explícitos (resúmenes 2×1 y 1×1; listas y agenda 3×2; calendario mensual 3×4). Solo se ofrece si no existen preferencias o al restablecer el diseño; no migra ni reescribe distribuciones personalizadas. El editor conserva su barra lateral y el movimiento exclusivamente desde el agarre.
