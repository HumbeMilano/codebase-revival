# Segunda etapa de Skendal

Trabajo autorizado el 29 de octubre de 2026. Seguimiento: [M1 #34](https://github.com/HumbeMilano/codebase-revival/issues/34).

## Primer bloque: confianza y uso cotidiano

- **Sesión (#36):** conservar la vista y el formulario ya autorizados ante fallos temporales. La denegación de acceso tiene prioridad, incluso si otra petición simultánea falla temporalmente. Un cambio de cuenta invalida los clientes anteriores y las respuestas obsoletas no restauran el hogar. Se elimina la segunda carga inicial de las colecciones.
- **Navegación (#38):** la sección y referencias válidas se conservan en la URL; Atrás, Adelante y recarga mantienen el destino. Los enlaces a finanzas, fotos y gestión conservan la comprobación de permisos. Las URLs no contienen títulos, importes ni borradores privados.
- **Primer uso (#37, parcial):** elección neutral de hogar con creación explícita y ayuda de acceso plegada. Las invitaciones siguen abriendo su aceptación. Los widgets vacíos ofrecen acciones para añadir datos reales; no se restaura el tour ni se obliga a personalizar.
- **Finanzas (#43):** el vencimiento programado genera una estimación, sin convertirse en pago confirmado. Los resúmenes y el fondo descuentan solamente pagos registrados explícitamente. Las estimaciones pendientes se identifican aparte y permanecen dentro del total sin confirmar. Confirmar un pago registra el ajuste mensual existente; no se mueven fondos bancarios ni se reescriben registros históricos.

## Verificación y límites

Las regresiones usan cuentas, hogares y respuestas sintéticas. Los controles físicos de teclado/gestor, instalación, QR y lectores de pantalla se registran por separado en #48. Una prueba de navegador móvil emulado no equivale a un dispositivo real.

La configuración inicial de PIN sigue siendo obligatoria en el contrato actual del servidor. Su aplazamiento y la activación al vincular tablet requieren una actualización coordinada que mantenga todas las verificaciones del servidor. Esa parte de #37 permanece abierta hasta completarse.

Rutinas, avisos externos, integración de agenda, mejoras de compras, idioma, oferta, operación y condiciones de lanzamiento se siguen en sus tareas. Este bloque no activa cobros, límites, ampliaciones de planes ni una apertura pública. La empresa constituida y los documentos definitivos siguen siendo condiciones pendientes del propietario.

Cada entrega registra commit, CI, despliegue y evidencia publicados. El diagnóstico original permanece como línea de base, con su commit y limitaciones; no se cambia para presentar observaciones antiguas como fallos actuales.
