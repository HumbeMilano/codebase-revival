# Suscripciones: verificación segura en Stripe sandbox

## Flujo del producto

- Perfil → Mi plan (`/subscription`) muestra Free/Pro y la etapa de preparación.
- Las pruebas de Checkout están disponibles solo para un adulto con cuenta personal verificada que sea administrador de plataforma o tenga un trabajo QA privado vigente. Los hogares ordinarios no reciben una falsa pantalla de compra.
- El servidor obtiene precio y moneda del catálogo protegido. La solicitud del navegador solo contiene periodicidad, UUID de reintento y confirmación de sandbox.
- El intento conserva el precio, revisión, comprador, hogar y vencimiento originales. Un reintento no cambia el comprador ni crea otra sesión pendiente. Si hay otra periodicidad abierta, debe completarse o caducar primero.
- Stripe Checkout recoge exclusivamente datos de tarjeta de prueba. El retorno a la app solo pide actualizar el estado; sus parámetros no conceden Pro.
- Los webhooks verifican HMAC sobre los bytes originales y registran eventos deduplicados. También se reconcilian reintentos de eventos ya registrados si una entrega anterior falló después del registro.
- La reconciliación obtiene el estado actual de Stripe bajo una exclusión temporal del servidor y valida cliente, hogar, intento y precio registrado. La hora de llegada de un evento antiguo no revierte una suscripción nueva. Eventos de las antiguas comprobaciones de conexión no conceden planes.
- El portal de Stripe permite al comprador cambiar tarjeta, consultar facturas, cambiar mensual/anual y cancelar al final del período. Stripe calcula los ajustes de prorrateo. Otro adulto del mismo hogar no puede abrir la facturación del comprador.
- `active`/`trialing` representan Pro **simulado**; `past_due`/`unpaid` y cancelación efectiva representan Free simulado. Una cancelación programada mantiene el estado simulado hasta que sea efectiva. Nada de esto modifica `households.plan` ni ingresos reales.
- Los precios nuevos generan Price IDs nuevos. Las suscripciones existentes conservan su precio hasta una modificación explícita; un cambio de configuración del negocio no cambia sus cobros silenciosamente.

## Pruebas automatizadas locales

```
bun run check
bun run test:e2e
python3 scripts/test-database.py
python3 scripts/test-database.py --empty-install
python3 scripts/test-database.py --legal-only
bun run test:site
```

No ejecutar otro build de la app mientras se ejecuta su servidor de preview de Playwright: ambos usan `dist/`. Las pruebas de base de datos usan Postgres descartable y no tocan Supabase real.

## Prueba real del proveedor, sin dinero real

La prueba del proveedor requiere los secretos de sandbox ya guardados en el Worker. No recuperar ni copiar la clave privada de Stripe, la clave de gateway o la clave `service_role` al cliente/terminal para probar.

1. Crear mediante la conexión de gestión de Supabase un trabajo en `homehub_private.subscription_test_jobs`, solicitado por el administrador de plataforma verificado. Usar UUID y dos capacidades aleatorias independientes de al menos 40 caracteres; guardar solo SHA-256 en la base de datos. El vencimiento no puede superar 2 horas. Escenarios: `checkout`, `clock-month`, `clock-year`.
2. Conservar capacidades, contraseña aleatoria y PIN de prueba en un archivo **fuera del repositorio**, con permisos 0600. Nunca incluirlos en logs, capturas o informes públicos.
3. `billing-qa-user` verifica esa capacidad de gestión antes de crear una identidad exacta `qa-subs-<UUID>@example.invalid` y un hogar vacío `Skendal billing QA <UUID>`. Usa la API Auth oficial; no fabrica JWT ni confirma cuentas humanas. El cliente inicia sesión mediante contraseña normal.
4. En el escenario Checkout, entrar desde la app con esa identidad, abrir Mi plan y completar Stripe Checkout con `4242 4242 4242 4242`, vencimiento futuro y CVC de prueba. Verificar la suscripción e invoice de prueba, retorno y estado confirmado; abrir también el portal del comprador. Nunca usar una tarjeta real.
5. Los escenarios de reloj crean clientes de prueba de Stripe ligados a Test Clocks, con `pm_card_visa`, y prueban los períodos mensual y anual sin esperar meses. `/api/subscriptions/qa` no acepta IDs arbitrarios, importes ni URLs de Stripe; solo acciones enumeradas y el recurso exacto de su trabajo privado. Avanzar a la renovación, esperar `ready` y avanzar 2 horas para finalizar la factura cuando sea necesario. Probar fallo con `pm_card_chargeCustomerFail`, recuperación, cambio de intervalo, cancelación al final del período y cancelación efectiva. La sesión Checkout y los Test Clocks son escenarios independientes.
6. Verificar en Supabase los estados propios de sandbox y las entregas firmadas, y confirmar que ningún hogar real cambió de plan ni se crearon ingresos del negocio.
7. Borrar primero los recursos QA del proveedor con `cleanup_provider` y su capacidad independiente. Esta capacidad solo permite limpieza, incluso después de caducar la capacidad operativa. Borrar después la identidad y hogar exactos mediante `billing-qa-user` y la capacidad de limpieza. La validación impide borrar hogares compartidos o usuarios ordinarios. Repetir limpieza debe ser seguro. Stripe conserva los registros de prueba que su plataforma deba retener; no prometer la eliminación de su historial interno.
8. Archivar únicamente resultados sanitizados: IDs de prueba, estados, importes, periodos y resultado de limpieza. Registrar por separado qué casos pasaron realmente y cuáles siguen pendientes. Una prueba simulada local no equivale a un pago verificado en Stripe.

No hay ruta para activar cobros reales en esta versión. Constituir la empresa no activa automáticamente Stripe live.
