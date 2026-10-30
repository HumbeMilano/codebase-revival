# Importes ocultos en los widgets de la tablet

Petición del propietario del 30 de octubre de 2026. Relacionado con [M1 #34](https://github.com/HumbeMilano/codebase-revival/issues/34), [inicio #38](https://github.com/HumbeMilano/codebase-revival/issues/38) y [finanzas #43](https://github.com/HumbeMilano/codebase-revival/issues/43).

La autorización financiera de la tablet vence a los 15 minutos. Antes, esa transición retiraba del dashboard los widgets financieros y cambiaba la distribución visible. Ahora Fondo común, Facturas, Resumen de miembro y Próximo vencimiento permanecen en las mismas celdas con marcadores de importes ocultos y una acción para mostrarlos.

«Mostrar importes» solicita el PIN adulto mediante el teclado propio. Se usan los RPC existentes `verify_pin` y `authorize_finances`, con sus límites de intentos, vencimiento y comprobaciones del servidor. El PIN de un menor o una cancelación no revela datos. Una autorización correcta conserva el dashboard y el perfil activo; entrar desde la sección Finanzas sigue abriendo esa sección.

## Datos y diseño

El estado bloqueado no monta importes, porcentajes, saldos, nombres de facturas ni cantidades derivadas de registros financieros. No es un desenfoque por CSS: el componente de máscara solo recibe el tipo/tamaño del widget y, si corresponde, el nombre público del miembro del hogar. No acepta datos financieros. Al vencer el permiso se limpian las colecciones financieras y las peticiones dejan de enviar el token. Volver a la pestaña revalida la autorización local; una respuesta financiera tardía no puede reutilizar un permiso vencido.

Tras verificar un PIN se espera una consulta autorizada nueva antes de revelar. Una consulta pendiente conserva la máscara, sin mostrar un saldo cero ficticio. Los widgets conservan claves, tamaños, orden y referencias; la expiración no guarda ni reescribe preferencias. Si ocurre durante la edición, las tarjetas se mantienen en su lugar y sus acciones de revelar permanecen inactivas. Las tarjetas bloqueadas existentes pueden moverse, redimensionarse o retirarse de la disposición local; añadir tipos financieros sigue requiriendo autorización.

La caducidad y las reglas de Postgres no cambian. Los perfiles de tablet siguen separados y las cuentas personales de menores conservan sus reglas de visibilidad. Bloquear/cerrar sesión revoca el acceso; no se guarda el PIN ni el token en el diseño, el almacenamiento local o la URL.

## Comprobaciones

`e2e/finance-widget-lock.spec.ts` adelanta el reloj más de 15 minutos y verifica las cuatro tarjetas, el PIN adulto/menor/incorrecto, cancelación, mismo perfil/destino, respuestas pendientes, vencimiento en edición, guardado de diseño y los doce tamaños. La suite previa conserva la separación por perfil, el bloqueo de la tablet y los permisos de finanzas. Las pruebas unitarias verifican que la máscara no expone datos ni navega a Finanzas al solicitar acceso desde Inicio.

Los resultados de CI y publicación se registran en el PR correspondiente. Son pruebas de navegador con backend/Auth sintéticos y PostgreSQL desechable; no equivalen a una prueba física del iPad. No requieren cambios de esquema, cuentas ni cuotas, ni modifican datos reales.
