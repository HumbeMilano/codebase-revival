# HomeHub · Codebase Revival

Aplicación para organizar un hogar desde el móvil o una tablet compartida: tareas, compras, calendario, notas y gastos. Usa React 19, TanStack Start, Tailwind y Supabase/Lovable Cloud. El dictado procesa audio localmente con Whisper en un Web Worker.

El proyecto está conectado a [Lovable](https://lovable.dev/projects/1a63478a-d161-4f28-bbe7-60ca09fd441f). Los cambios integrados en la rama conectada se sincronizan con su editor. No reescribas historia publicada ni hagas force push.

## Desarrollo

Requisitos: Node.js 22.12 o posterior, Bun 1.4.3 y un proyecto Supabase/Lovable configurado.

```sh
git clone https://github.com/HumbeMilano/codebase-revival.git
cd codebase-revival
bun install --frozen-lockfile
cp .env.example .env.local
# Sustituye las variables públicas por las del proyecto correcto.
bun run dev
```

Abre la dirección que muestre Vite. `bun.lock` es el lockfile canónico; usa una instalación congelada en CI. No añadas un segundo lockfile de npm o pnpm.

La configuración pública del proyecto puede estar versionada por la integración de Lovable. Guarda cambios locales en `.env.local`. Las variables `VITE_*` se incluyen en el navegador: solo admiten la URL y la clave **publicable**. Nunca pongas claves secretas o `service_role`, contraseñas ni URLs administrativas de base de datos en ellas.

## Acceso y datos

- Una persona crea una cuenta y confirma su correo. Después crea un hogar o acepta una invitación de un adulto.
- Las cuentas están vinculadas a un miembro del hogar. El rol adulto/hijo se guarda en tablas protegidas, separado del perfil editable.
- Un adulto genera un código temporal para vincular una tablet. La tablet accede al hogar con un token revocable y cada persona entra con su PIN.
- Finanzas exige un adulto o una autorización de PIN adulto válida, vinculada a la sesión o tablet. Ocultar una sección no sustituye la autorización de servidor.
- La información se persiste en Postgres y se refresca entre dispositivos. Una operación fallida debe mostrar el error y reconciliar el estado; no se promete una cola durable de cambios sin conexión.
- El dictado requiere descargar el modelo la primera vez y permiso de micrófono. El audio se convierte a 16 kHz y no se envía a una API de IA.

No existen credenciales universales de demostración. Los códigos de invitación, PIN y códigos de tablet pertenecen a cada hogar.

## Base de datos

Las migraciones son el contrato del backend. El frontend y las migraciones nuevas deben desplegarse coordinadamente para que existan las columnas y RPC que usa la aplicación.

El historial inicial está en `drizzle/migrations/0000_*.sql` a `0010_*.sql`. La migración de endurecimiento es `supabase/migrations/20261022022429_homehub_functional_hardening.sql`. Sus archivos se conservan por compatibilidad con el historial de Lovable y se aplican una vez, en orden. Las correcciones posteriores se incorporan mediante migraciones nuevas en `supabase/migrations/`; no se modifica una migración ya aplicada.

`drizzle/schema.ts` y los snapshots vacíos son artefactos históricos y no describen la base existente. Se retiró la herramienta de generación para evitar un push accidental de ese esquema vacío. Inspecciona el esquema real y usa migraciones SQL revisadas.

Para un proyecto existente, verifica qué migraciones ya están aplicadas antes de ejecutar las pendientes. Para un proyecto nuevo, provisiona Supabase Auth/Storage, aplica primero el historial inicial y después las migraciones de `supabase/migrations` por fecha. Usa una herramienta de migración que registre cada archivo aplicado; no ejecutes todo el historial a ciegas contra una base existente. Los scripts de prueba de la base usan datos sintéticos y deben apuntar exclusivamente a una base desechable.

La migración conserva registros históricos al añadir algunas restricciones con `NOT VALID`: se comprueban las escrituras nuevas y las filas modificadas, pero no se borran ni reescriben datos previos automáticamente. Revisa los posibles registros heredados y valida las restricciones después de reconciliarlos ejecutando `scripts/validate-constraints.sql` mediante la conexión administrativa del proyecto. La validación falla ante inconsistencias y no elimina ni reescribe datos.

El primer administrador de plataforma se aprovisiona mediante una operación administrativa controlada por el propietario. Tras verificar el UUID en Supabase Auth, un operador con acceso administrativo puede ejecutar `INSERT INTO public.user_roles (user_id, role) VALUES ('<UUID-verificado>', 'platform_admin') ON CONFLICT DO NOTHING;`. La app no permite a la primera cuenta registrada reclamar ese privilegio. No expongas credenciales administrativas para completar ese paso.

Antes de publicar, configura en Supabase/Lovable los orígenes y redirecciones permitidas de confirmación y recuperación de contraseña. Comprueba también el bucket privado de avatares y los permisos de las RPC.

## Comprobaciones

```sh
bun run typecheck
bun run test
bun run lint
bun run format:check
bun run build
bun audit --audit-level=high
bun run test:db # Requiere Python 3 y Docker; crea una base desechable.
```

`bun run check` ejecuta tipado, pruebas unitarias, lint, formato y compilación. `bun run format` aplica formato; mantenlo separado de cambios de comportamiento para facilitar su revisión.

Las pruebas de navegador usan un backend HTTP sintético local y no escriben en el proyecto real:

```sh
bunx playwright install chromium
bun run test:e2e
```

La CI ejecuta las mismas comprobaciones y guarda los resultados del navegador cuando hay un fallo. La compilación genera un destino Nitro/Cloudflare; `bun run preview` permite verificar el build antes de publicarlo.

Las pruebas locales no sustituyen la verificación en el backend desplegado: registro confirmado, invitaciones, recuperación, avatar privado, dos dispositivos, revocación, suspensión y dictado en iPad/Android reales. No actives límites de planes ni cobros sin definir antes las condiciones del producto.
