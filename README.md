# HomeHub · Codebase Revival

Aplicación para organizar un hogar desde el móvil o una tablet compartida: tareas, compras, calendario, notas y gastos. Usa React 19, TanStack Router, Vite, Tailwind y Supabase.

El inicio permite elegir, ordenar y ampliar widgets de cada sección desde «Personalizar». El diseño se guarda por cuenta; en una tablet compartida se conserva por miembro en ese dispositivo.

La aplicación está publicada en `https://app.skendal.com` y su web de presentación para `https://skendal.com`, alojadas como archivos estáticos en Cloudflare. Consulta [Producción](docs/production.md) para las cuentas, el backend y la activación del correo. La aplicación no necesita servicios de Lovable. Se conserva su historial Git; no reescribas commits publicados ni hagas force push.

## Desarrollo

Requisitos: Node.js 22.12 o posterior, Bun 1.4.3 y un proyecto Supabase configurado.

```sh
git clone https://github.com/HumbeMilano/codebase-revival.git
cd codebase-revival
bun install --frozen-lockfile
cp .env.example .env.local
# Sustituye las variables públicas por las del proyecto correcto.
bun run dev
```

Abre la dirección que muestre Vite. `bun.lock` es el lockfile canónico; usa una instalación congelada en CI. No añadas un segundo lockfile de npm o pnpm.

Guarda la configuración del proyecto en `.env.local`. Las variables `VITE_*` se incluyen en el navegador: solo admiten la URL y la clave **publicable**. Nunca pongas claves secretas o `service_role`, contraseñas ni URLs administrativas de base de datos en ellas.

## Acceso y datos

- Una persona crea una cuenta y confirma su correo. Después crea un hogar o acepta una invitación de un adulto.
- Las cuentas están vinculadas a un miembro del hogar. El rol adulto/hijo se guarda en tablas protegidas, separado del perfil editable.
- La tablet muestra un QR en `/vincular` o en la opción «Tablet». El teléfono lo escanea y una cuenta adulta confirma el hogar con su passkey; si aún no tiene una, se crea en ese momento. La tablet recibe solo un token revocable y cada persona entra con su PIN mediante el teclado propio. Este QR de la aplicación no verifica cercanía por Bluetooth.
- Finanzas exige un adulto o una autorización de PIN adulto válida, vinculada a la sesión o tablet. Ocultar una sección no sustituye la autorización de servidor.
- La información se persiste en Postgres y se refresca entre dispositivos. Las compras se guardan en IndexedDB y una cola durable reintenta sincronizarlas; los conflictos requieren una elección explícita. El resto de las funciones necesita conexión.
- Las invitaciones se envían por correo y abren el registro. Solo las puede aceptar la dirección confirmada que las recibió.
- Las tareas realizadas permanecen en Actuales durante 72 horas y después aparecen en Archivadas.
- Los aportes tienen fecha (hoy por defecto); el mes corresponde a la fecha elegida.
- Los adultos gestionan hasta 12 fotos privadas para el carrusel de la pantalla de bloqueo, que ocupa todo el viewport.
- Se retiraron el dictado, el micrófono y las dependencias de procesamiento de audio.

No existen credenciales universales de demostración. Las invitaciones, PIN y tokens revocables de tablet pertenecen a cada hogar.

## Base de datos

Las migraciones son el contrato del backend. El frontend y las migraciones nuevas deben desplegarse coordinadamente para que existan las columnas y RPC que usa la aplicación.

El historial inicial está en `drizzle/migrations/0000_*.sql` a `0010_*.sql`. La migración de endurecimiento es `supabase/migrations/20261022022429_homehub_functional_hardening.sql`. Sus archivos se conservan por compatibilidad con el historial de Lovable y se aplican una vez, en orden. Las correcciones posteriores se incorporan mediante migraciones nuevas en `supabase/migrations/`; no se modifica una migración ya aplicada.

`drizzle/schema.ts` y los snapshots vacíos son artefactos históricos y no describen la base existente. Se retiró la herramienta de generación para evitar un push accidental de ese esquema vacío. Inspecciona el esquema real y usa migraciones SQL revisadas.

Para un proyecto existente, verifica qué migraciones ya están aplicadas antes de ejecutar las pendientes. Para un proyecto Supabase nuevo y vacío, `scripts/prepare-empty-database.py` genera una instalación atómica, registra el hash de cada archivo en `drizzle.__drizzle_migrations` y retira únicamente los datos de ejemplo del historial inicial. El script se niega a ejecutarse sobre datos de aplicación o cuentas existentes. Consulta el procedimiento en [Producción](docs/production.md). Los scripts de prueba usan datos sintéticos y deben apuntar exclusivamente a una base desechable.

La migración conserva registros históricos al añadir algunas restricciones con `NOT VALID`: se comprueban las escrituras nuevas y las filas modificadas, pero no se borran ni reescriben datos previos automáticamente. Revisa los posibles registros heredados y valida las restricciones después de reconciliarlos ejecutando `scripts/validate-constraints.sql` mediante la conexión administrativa del proyecto. La validación falla ante inconsistencias y no elimina ni reescribe datos.

El primer administrador se configura mediante la lista privada `homehub_private.platform_owners`, accesible solo al propietario del backend. La migración `20261022131820_verified_platform_owner.sql` concede el rol únicamente después de que Supabase Auth confirme el correo registrado. También es posible aprovisionar un UUID verificado desde una conexión administrativa. La app no permite reclamar ese privilegio públicamente.

Antes de publicar, configura en Supabase el SMTP y las redirecciones permitidas de confirmación y recuperación de contraseña. Comprueba también el bucket privado de avatares y los permisos de las RPC.

## Comprobaciones

```sh
bun run typecheck
bun run test
bun run lint
bun run format:check
bun run build
bun audit --audit-level=high
bun run test:db # Requiere Python 3 y Docker; crea una base desechable.
python3 scripts/test-database.py --empty-install
```

`bun run check` ejecuta tipado, pruebas unitarias, lint, formato y compilación. `bun run format` aplica formato; mantenlo separado de cambios de comportamiento para facilitar su revisión.

Las pruebas de navegador usan un backend HTTP sintético local y no escriben en el proyecto real:

```sh
bunx playwright install chromium
bun run test:e2e
```

La CI ejecuta las mismas comprobaciones y guarda los resultados del navegador cuando hay un fallo. La compilación genera la SPA estática en `dist` y el servidor privado de invitaciones en `worker-dist`; `bun run preview` permite verificarla antes de publicarla. `site/` contiene la web de presentación, independiente de la aplicación. Los archivos `wrangler.jsonc` y `wrangler.site.jsonc` describen ambos destinos.

Las pruebas locales no sustituyen la verificación en el backend desplegado: registro confirmado, invitaciones, recuperación, avatar privado, dos dispositivos, revocación, suspensión y passkeys en iPad/Android reales. No actives límites de planes ni cobros sin definir antes las condiciones del producto.
