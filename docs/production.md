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

`dist/` contiene la aplicación y `site/` la web. Los archivos `wrangler*.jsonc` describen los despliegues. El binario de ONNX supera 25 MiB, por lo que se carga desde un CDN público fijado a la misma versión instalada. `prepare-static.mjs` comprueba esa correspondencia, omite el fallback local y rechaza otros archivos que superen el límite. El modelo también se descarga al navegador. El audio del micrófono y la inferencia permanecen en el dispositivo.

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

Verificar con una cuenta real: registro y confirmación, inicio y cierre de sesión, recuperación de contraseña, creación de hogar, invitación, avatar privado, una segunda sesión, vinculación y revocación de tablet y autorización financiera por PIN. El dictado debe comprobarse con micrófono en los dispositivos previstos. Las pruebas locales con backend sintético no prueban la entrega de correos.

## Límites del presupuesto gratuito

Usar exclusivamente planes Free. Los archivos estáticos se sirven sin ejecutar SSR; no se provisionan almacenamiento R2, bases de pago ni APIs de IA. Supabase Free aplica cuotas de base de datos, archivos, transferencia y conexiones, y puede pausar proyectos con poca actividad. Resend Free aplica cuotas de envío. El agotamiento de cuotas puede interrumpir el servicio; no activa una ampliación de pago autorizada.

Las copias gestionadas, retención avanzada y garantías de disponibilidad de los planes de pago no están incluidas. Conservar exportaciones controladas por el propietario según la importancia y evolución de los datos. No presentar la aplicación como un sistema bancario: los gastos son registros y plantillas del hogar.
