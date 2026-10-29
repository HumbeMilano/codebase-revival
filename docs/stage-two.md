# Segunda etapa de Skendal

Trabajo autorizado el 29 de octubre de 2026. Seguimiento: [M1 #34](https://github.com/HumbeMilano/codebase-revival/issues/34).

## Primer bloque: confianza y uso cotidiano

- **Sesión (#36):** conservar la vista y el formulario ya autorizados ante fallos temporales. La denegación de acceso tiene prioridad, incluso si otra petición simultánea falla temporalmente. Un cambio de cuenta invalida los clientes anteriores y las respuestas obsoletas no restauran el hogar. Se elimina la segunda carga inicial de las colecciones.
- **Navegación (#38):** la sección y referencias válidas se conservan en la URL; Atrás, Adelante y recarga mantienen el destino. Los enlaces a finanzas, fotos y gestión conservan la comprobación de permisos. Las URLs no contienen títulos, importes ni borradores privados.
- **Primer uso (#37, parcial):** elección neutral de hogar con creación explícita y ayuda de acceso plegada. Las invitaciones siguen abriendo su aceptación. Los widgets vacíos ofrecen acciones para añadir datos reales; no se restaura el tour ni se obliga a personalizar.
- **Finanzas (#43):** el vencimiento programado genera una estimación, sin convertirse en pago confirmado. Los resúmenes y el fondo descuentan solamente pagos registrados explícitamente. Las estimaciones pendientes se identifican aparte y permanecen dentro del total sin confirmar. Confirmar un pago registra el ajuste mensual existente; no se mueven fondos bancarios ni se reescriben registros históricos.

## Verificación y límites

Las regresiones usan cuentas, hogares y respuestas sintéticas. Los controles físicos de teclado/gestor, instalación, QR y lectores de pantalla se registran por separado en #48. Una prueba de navegador móvil emulado no equivale a un dispositivo real.

## Segundo bloque: PIN cuando hace falta

La creación y la aceptación de hogar permiten posponer el PIN. La primera vinculación por QR pide al adulto configurar el suyo antes de la verificación con passkey; también se configura o cambia desde Mi perfil. El PIN sigue siendo un teclado de botones, separado de la contraseña de la cuenta.

La migración nueva permite un hash privado nulo para «sin configurar», sin generar un PIN predeterminado. Un valor nulo nunca verifica ni autoriza finanzas. Los PIN anteriores no se modifican; el cambio propio comprueba la cuenta esperada, toma el bloqueo del hogar, conserva roles/perfiles e invalida las autorizaciones financieras existentes. La invitación de reasignación conserva el miembro y su historial, pero desactiva el PIN del titular anterior cuando el receptor elige configurarlo después.

El servidor exige un PIN configurado al adulto que aprueba el QR. Esa comprobación complementa los controles existentes de rol, sesión, passkey reciente, uso único y secretos separados. #37 sigue abierta hasta comprobar el primer resultado y la comprensión del recorrido con participantes.

Rutinas, avisos externos, integración de agenda, mejoras de compras, idioma, oferta, operación y condiciones de lanzamiento se siguen en sus tareas. Este bloque no activa cobros, límites, ampliaciones de planes ni una apertura pública. La empresa constituida y los documentos definitivos siguen siendo condiciones pendientes del propietario.

Cada entrega registra commit, CI, despliegue y evidencia publicados. El diagnóstico original permanece como línea de base, con su commit y limitaciones; no se cambia para presentar observaciones antiguas como fallos actuales.

## Primera publicación verificada

PR [#51](https://github.com/HumbeMilano/codebase-revival/pull/51), commit integrado `b32332f9c632272f3e888270d18ef1fa68472d8c`, CI [40915293928](https://github.com/HumbeMilano/codebase-revival/actions/runs/40915293928): 214 pruebas unitarias, 189 de navegador y 12 de PWA; tres omisiones de navegador existentes. También pasaron los trabajos de base de datos y web.

Versión publicada `6f495055-0589-4a96-ba71-831a2960fc88`, en app y administración; 16 hashes públicos coinciden y se conservaron las 11 definiciones de bindings. Los 36 casos nuevos y 12 de separación PWA pasaron contra esos archivos publicados con Auth/datos sintéticos. No hubo cambios de esquema ni de cuentas reales en ese bloque. #36 está cerrada; los criterios restantes de #37/#38/#43 y las pruebas físicas siguen abiertos.

## Segunda publicación y registro de migración

El PIN aplazado se integró en [#52](https://github.com/HumbeMilano/codebase-revival/pull/52), commit `8296c6f30a2f44cebc2c2a0da736cc8eb8d54337`. [CI 40918066169](https://github.com/HumbeMilano/codebase-revival/actions/runs/40918066169) confirmó 214 unitarias, 197 de navegador, 12 PWA, 215 comprobaciones SQL y 11 de instalación vacía; tres omisiones de navegador existentes.

La fuente es `20261029165200_deferred_tablet_pin.sql`, SHA-256 `38b02d8ac0bbfffd85679e8b29fa4bddad2571f398f3e196edaf293709c92eee`. El conector de gestión la registró como versión nativa `20261029171517`, nombre `deferred_tablet_pin`. Su hash y fecha de origen `1793292720000` también están registrados una sola vez en `drizzle.__drizzle_migrations`. Antes de aplicar pendientes hay que cotejar los dos registros y el hash de origen; la diferencia de fechas no significa que esta migración siga pendiente. No renombrar ni volver a aplicar el archivo ya publicado.

La versión de Worker es `4750c8fb-6af3-4c41-bf9b-53846484f85b`. La revisión de catálogo confirmó acceso al cambio de PIN solo para cuentas autenticadas y ausencia de cambios en la función compartida de intentos. La migración no cambia PINs existentes ni vínculos de cuentas reales; las pruebas de escritura usan únicamente bases desechables y backends HTTP sintéticos.
