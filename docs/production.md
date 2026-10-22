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

Verificar con una cuenta real: registro y confirmación, inicio y cierre de sesión, recuperación de contraseña, creación de hogar, invitación, avatar privado, una segunda sesión, vinculación y revocación de tablet y autorización financiera por PIN. Las passkeys y su método de otro dispositivo deben comprobarse con el móvil y la tablet reales. Las pruebas locales con backend sintético no prueban la entrega de correos.

## Límites del presupuesto gratuito

Usar exclusivamente planes Free. Los archivos estáticos se sirven sin ejecutar SSR; no se provisionan almacenamiento R2, bases de pago ni APIs de IA. Supabase Free aplica cuotas de base de datos, archivos, transferencia y conexiones, y puede pausar proyectos con poca actividad. Resend Free aplica cuotas de envío. El agotamiento de cuotas puede interrumpir el servicio; no activa una ampliación de pago autorizada.

Las copias gestionadas, retención avanzada y garantías de disponibilidad de los planes de pago no están incluidas. Conservar exportaciones controladas por el propietario según la importancia y evolución de los datos. No presentar la aplicación como un sistema bancario: los gastos son registros y plantillas del hogar.

## Actualización de uso diario

La migración `20261022205610_household_daily_use.sql` añade fechas de aportes y finalización de tareas, invitaciones ligadas al correo, recibos de reintentos de compras, metadatos de fotos y vinculación mediante passkey. No ejecutar el instalador vacío para actualizar una instalación existente. Aplicar únicamente las migraciones pendientes y registrar su SHA-256 y fecha de origen en `drizzle.__drizzle_migrations`, además del historial nativo de Supabase. Las tareas antiguas ya completadas reciben la fecha de actualización y conservan 72 horas de visibilidad; las fechas desconocidas de aportes históricos permanecen sin inventar.

`20261022215736_household_photo_permissions.sql` retira también el permiso explícito de ejecución anónima que Supabase concede por defecto a las funciones nuevas de gestión de fotos. La validación interna sigue exigiendo una cuenta adulta. La base desechable reproduce estos permisos predeterminados para comprobar tanto el rechazo por permisos como la autorización dentro de cada RPC. Los tipos de Supabase se regeneraron desde el esquema desplegado.

**Servidor de invitaciones:** el Worker usa `SUPABASE_URL`, `SUPABASE_PUBLIC_KEY` y el secreto `RESEND_API_KEY`, limitado al envío desde `mail.skendal.com`. Guardar este último con la API de secretos de Cloudflare o `wrangler secret put RESEND_API_KEY`; nunca añadirlo a Git, `.env.example`, `VITE_*` o a archivos estáticos. Conservar los bindings de tipo `secret_text` al publicar mediante API. La ruta `/api/*` ejecuta el Worker antes de los assets. La API comprueba el JWT y delega la autorización de adulto y los límites a Postgres (20 intentos por hora y hogar, un minuto entre intentos de la misma invitación). Un fallo deja la invitación pendiente; los reintentos de entrega incierta son idempotentes y un reenvío solicitado tras un envío confirmado obtiene una nueva identidad de entrega. La etiqueta «enviada» significa aceptada por el proveedor; no garantiza lectura ni llegada a bandeja principal.

**Passkeys:** el propietario habilitó Auth Passkeys con RP ID `app.skendal.com` y origen `https://app.skendal.com`. En el móvil, iniciar sesión y abrir Mi perfil → Passkeys → Añadir passkey. En la tablet sin sesión, abrir Tablet → Vincular con passkey → Usar otro dispositivo. El sistema presenta el QR y usa Bluetooth para comprobar cercanía en su método híbrido. WebAuthn no permite imponer al navegador que utilice exclusivamente ese transporte. El servidor exige un inicio de sesión por passkey de los últimos dos minutos, cuenta adulta activa y una sola vinculación por esa sesión. La sesión personal es temporal y no se persiste en la tablet; el token del dispositivo es revocable. Los códigos antiguos dejan de permitir nuevas vinculaciones; las tablets vinculadas previamente conservan su token hasta revocación.

**Fotos:** desplegar `supabase/functions/household-photos/index.ts`. Su `verify_jwt=false` es intencionado para las tablets anónimas: la función verifica `my_context()` y la lista de fotos autorizadas antes de usar la clave de servicio del runtime para firmar únicamente rutas del propio hogar. El bucket `household-photos` es privado. Los adultos pueden subir, ordenar y quitar hasta 12 fotos JPG/PNG/WebP, comprimidas a un máximo de 1600 píxeles y 2 MiB. La tablet rota cada 20 segundos, permite pausar y respeta movimiento reducido. La caché de imágenes vive en memoria para evitar descargar las mismas fotos cada rotación; se limpia al cambiar de contexto. Los enlaces firmados caducan a los cinco minutos.

**Compras sin internet:** abrir la app con la cuenta personal y conexión al menos una vez en ese navegador. El service worker conserva la aplicación y las compras se guardan en IndexedDB, separadas por cuenta, hogar y miembro. Se puede añadir, marcar y quitar productos incluso tras recargar sin red. Al reconectar se valida otra vez el acceso antes de transmitir la cola. Si otro dispositivo modificó el mismo producto, elegir «Aplicar mis cambios» o «Usar la lista del hogar»; no se descartan cambios silenciosamente. Una cola de más de 14 días requiere revisión. No borrar los datos del navegador mientras haya cambios pendientes; el almacenamiento local puede perderse al desinstalar o borrar datos y el modo privado puede limitarlo. Las finanzas no se almacenan para uso sin conexión. La tablet compartida mantiene sus controles de PIN y requiere conexión.

**Pantalla completa:** el bloqueo ocupa todo el viewport, sin marco de vista previa. Safari conserva sus propias barras cuando se abre en una pestaña; para el modo independiente, usar Compartir → Añadir a pantalla de inicio. La app muestra un aviso cuando hay una versión nueva para que se recargue después de guardar los formularios.

Los tipos de bindings del Worker se generan con `bun x wrangler types workers/env.d.ts --env-interface WorkerEnv --strict-vars=false`; regenerarlos cuando cambie `wrangler.jsonc`. Los tests de navegador construyen y sirven la versión de producción con backend sintético, incluida la instalación del service worker y una recarga sin conexión. No envían correos reales ni simulan una validación criptográfica de una passkey física.
