# Operación del negocio Skendal / HomeHub

## Acceso maestro

La consola está en `https://app.skendal.com/admin`. El propietario entra con su cuenta verificada incluida en la lista privada de administración. El rol protegido `platform_admin` es independiente de los adultos de cada hogar: no necesita crear ni pertenecer a un hogar. Una cuenta adulta de una familia no obtiene acceso al negocio.

La consola ofrece resumen de altas y accesos recientes, hogares y suspensión/reactivación, cuentas verificadas, asignación manual de planes, pagos externos y exportación CSV, configuración del negocio, precios mensuales y anuales e historial administrativo. Solo un propietario de la lista privada puede conceder o retirar administración a otras cuentas verificadas; no se puede retirar el rol a un propietario desde la aplicación. Los clientes administrativos quedan ligados a la cuenta que los abrió y dejan de enviar peticiones al cambiar de sesión.

Los registros de pagos externos son un libro interno, no facturas fiscales. Empiezan pendientes. Registrar un cobro recibido exige confirmar que el dinero se recibió fuera de HomeHub y guardar una referencia. No se cobra ni se devuelve dinero desde esos controles. No se mezclan con facturas o aportes familiares. Los totales separan monedas y se calculan en céntimos enteros. Las exportaciones protegen las celdas frente a fórmulas de hojas de cálculo.

## Precios autorizados y editables

País: Estados Unidos (`US`). Moneda: dólar (`USD`). Proveedor: Stripe. Family Pro parte de **US$2.99 al mes** y **US$5.99 al año**, editables en Administración → Planes. Son dos tarifas independientes, no una multiplicación automática. No cambiar el precio de suscripciones ya vendidas sin un proceso explícito de notificación y actualización en Stripe.

El catálogo público `business_catalog()` expone solo nombres, monedas y precios; la web los consulta para reflejar la configuración actual. Mientras los cobros reales estén desactivados, los presenta como precios previstos. Crear una cuenta no solicita tarjeta. Los permisos y funciones familiares actuales se conservan durante esta preparación comercial; la distinción comercial exacta entre el acceso inicial y Pro aún debe definirse.

## Stripe sandbox

El secreto de Stripe proporcionado por el propietario se conserva en Cloudflare con el nombre **`SecreteStripe`**. No va en `VITE_*`, el frontend, GitHub ni las respuestas del servidor. La aplicación acepta exclusivamente claves `sk_test_…` o `rk_test_…` en esta integración. Una clave live se rechaza.

Endpoints del Worker:

- `GET /api/billing/status`: disponibilidad de las conexiones, solo administradores verificados.
- `POST /api/billing/checkout`: Checkout de suscripción en sandbox, solo administradores. Recibe intervalo y UUID de intento; el servidor toma los precios protegidos del plan. Mantiene el mismo UUID ante una respuesta incierta y aplica un límite de peticiones.
- `POST /api/billing/setup`: configuración privada del endpoint de pruebas. Solo admite la clave de servidor `BILLING_GATEWAY_KEY`; no es una operación del navegador ni una vía para dar permisos a usuarios.
- `POST /api/billing/stripe-webhook`: recibe eventos de pruebas de Stripe. Verifica HMAC sobre los bytes originales, admite rotación de firmas y rechaza firmas con más de cinco minutos de antigüedad y eventos live. Un error al guardar devuelve un error para que Stripe reintente.

`BILLING_GATEWAY_KEY` es una credencial independiente del emparejamiento de tablets. Su hash se guarda en un esquema privado de Supabase. La firma del webhook se conserva como secreto `STRIPE_WEBHOOK_SECRET` del Worker y en `homehub_private.stripe_sandbox_settings` para su configuración privada; solo el gateway autenticado puede recuperarla del backend. La administración ve identificadores y eventos, nunca secretos de firma.

La configuración crea un endpoint en Stripe sandbox para `https://app.skendal.com/api/billing/stripe-webhook`, con API `2026-09-30.endive`. La creación usa idempotencia de Stripe. La comprobación privada `setup?verify=1` crea un Checkout de sandbox con la tarifa mensual vigente y lo caduca inmediatamente, sin introducir tarjeta, para comprobar la sesión y la recepción del evento firmado. No registra datos de tarjetas. El historial acepta eventos de Checkout, suscripción y facturas etiquetados para HomeHub sandbox, elimina los campos de correo/dirección y deduplica por ID de evento. Los eventos de otros productos del mismo sandbox se ignoran. **Ningún evento de sandbox activa un plan de pago real ni suma ingresos del negocio.**

Para comprobarlo manualmente: Administración → Planes → Stripe Sandbox → Probar mensual o anual. Stripe ofrece sus tarjetas de prueba en `https://docs.stripe.com/testing`, incluida `4242 4242 4242 4242` con una fecha futura. La vuelta de Checkout no es una prueba de pago: la confirmación se consulta en los eventos recibidos. Este procedimiento no está autorizado para tarjetas o claves reales.

## Antes de vender de verdad

La infraestructura puede permanecer en los planes gratuitos de Cloudflare, Supabase y Resend dentro de sus cuotas; el dominio ya pagado conserva su renovación. Stripe aplica sus propias comisiones a pagos reales. No se activa ninguna ampliación automática de infraestructura.

Falta concretar y verificar:

1. Nombre legal/comercial y correo de soporte publicable; contacto de privacidad y solicitud de eliminación.
2. Qué incluye cada plan, posible prueba inicial, política de cancelación/devolución y tratamiento de suscripciones existentes al cambiar precios.
3. Política de privacidad y términos finales según el negocio, así como impuestos aplicables. La información técnica de datos de la web no sustituye estos documentos.
4. Stripe live con la cuenta comercial verificada, configuración fiscal y portal de clientes. Requiere una integración separada para los usuarios de hogares, suscripciones, renovaciones, cancelaciones, impagos, reembolsos y permisos efectivos; el gateway actual es exclusivo para las pruebas de administración.
5. Probar en sandbox cada transición anterior, eventos duplicados/desordenados, reintentos y reconciliación antes de habilitar cargos reales.
6. Revisión periódica de cuotas de base de datos, fotos, correo y Workers; exportaciones/recuperación y procedimiento de soporte ante cuentas bloqueadas.

No se publican condiciones legales inventadas, una identidad jurídica supuesta ni un formulario que cobre sin estas decisiones.
