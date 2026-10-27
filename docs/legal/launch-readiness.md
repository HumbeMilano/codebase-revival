# Skendal: preparación legal y lanzamiento

Estado al 26 de octubre de 2026: **empresa pendiente; sin lanzamiento comercial; cobros reales desactivados**. Los borradores ES/EN están en `legal/documents.mjs`, se revisan en Administración → Legal y se exportan con `node scripts/export-legal.mjs`. No son contratos vigentes. Guardar datos del operador no los publica.

## Decisiones del propietario

- Marca: Skendal; mercado inicial Estados Unidos; comunicación en inglés y español. La aplicación aún está en español.
- El operador será una empresa de desarrollo informático todavía no constituida. No atribuir el servicio a una LLC o corporación inexistente.
- Cuentas desde los 13 años; administración del hogar y contratación desde los 18. Personas de 13 a 17 con autorización y supervisión de su padre, madre o tutor. No se admite el uso de la aplicación por menores de 13 en el lanzamiento previsto. Esta es una política de elegibilidad, no una afirmación de verificación documental de edad.
- Stripe sandbox solamente. Los eventos de prueba nunca cambian el plan real de un hogar ni se suman a ingresos.
- Precio propuesto por hogar: USD 2.99/mes o USD 5.99/año, editable. La tarifa anual es aproximadamente 83% menor que doce mensualidades; es una decisión comercial pendiente de validar, no un error corregido automáticamente.

## Antes de publicar documentos o activar venta

1. Constituir la empresa y completar nombre legal exacto, estado, dirección postal publicable, contactos de soporte, privacidad y copyright. Verificar que esos buzones reciban mensajes; no basta con escribir direcciones en el panel.
2. Revisar los textos con asesoría jurídica del estado de operación y completar los procedimientos reales de retención, eliminación, solicitudes de privacidad, incidentes y reembolsos. La propuesta de 7 días para la primera compra no está aprobada como política vigente. Conservar derechos que la ley no permite renunciar.
3. Implementar y comprobar el control de elegibilidad 13+/18+, permiso del responsable para adolescentes y prevención de cuentas de menores de 13. Un selector de edad es una declaración del usuario, no una verificación de identidad ni consentimiento parental verificable. Si se decide admitir menores de 13 o dirigir el producto a ellos, evaluar COPPA y cambiar el diseño antes de hacerlo.
4. Definir retención por clase de datos y copias de seguridad. Ejecutar en un hogar sintético un procedimiento completo de exportación, eliminación de cuenta, fotos/avatares, sesiones y referencias compartidas; documentar excepciones justificadas y plazos reales. No prometer eliminación inmediata de todas las copias si aún no se puede cumplir.
5. La consola registra solicitudes de acceso/corrección/eliminación y respuestas verificadas. **No ejecuta automáticamente la eliminación Auth/Storage.** Antes de marcar una solicitud completada, realizar y verificar la operación. Identificar los datos compartidos que pertenecen a otras personas y no exponerlos en una exportación.
6. Para aspirar al régimen aplicable de puerto seguro de DMCA §512: evaluar elegibilidad, política de infractores reincidentes, agente público y designación electrónica ante el Copyright Office. El texto de una política por sí solo no concede esa protección. La tarifa oficial consultada es **$6**, con renovación al menos cada 3 años; no se ha presentado ni pagado nada. Este trámite y la constitución/revisión no forman parte de infraestructura gratuita.
7. Verificar marca Skendal en USPTO, usos comerciales y estados pertinentes antes de invertir en distribución. Poseer skendal.com no equivale a tener derechos marcarios. El concepto gráfico incluye generación asistida por IA: no se garantiza copyright exclusivo sobre elementos generados; documentar aportes humanos y licencias. La tipografía Manrope conserva su licencia OFL en los activos.
8. Implementar aceptación explícita de la versión vigente de términos con registro de cuenta, versión y fecha; aviso de privacidad visible antes de la recolección; información clara de importe, frecuencia, renovación y cancelación antes del consentimiento de compra. Los borradores actuales no se presentan como aceptados.
9. Revisar Stripe en modo real, identidad de la empresa, extracto bancario, impuestos aplicables y portal de cancelación. Una prueba sandbox correcta no activa ni verifica la cuenta real. La migración actual prohíbe `commercial_launch=true`; habilitar venta real requerirá otro cambio revisado, no un interruptor accidental.
10. Probar accesibilidad, seguridad, privacidad infantil/juvenil y todas las rutas del lanzamiento. Publicar documentos definitivos y avisos coherentes ES/EN antes de abrir la venta.

## Free y Pro propuestos

Ambos incluyen tareas, calendario, notas, finanzas y compras con funcionamiento sin conexión. No se venden datos ni se incluyen anuncios como mecanismo de monetización propuesto. No se promete almacenamiento ilimitado.

| Capacidad por hogar | Free | Pro               |
| ------------------- | ---- | ----------------- |
| Miembros            | 4    | 12                |
| Listas activas      | 3    | 20                |
| Tablets vinculadas  | 1    | 3                 |
| Fotos de bloqueo    | 10   | 30                |
| Widgets por inicio  | 6    | Catálogo completo |

Las cinco capacidades y los precios son editables con control de revisión desde la consola. Los límites están desactivados durante la preparación. Los disparadores del servidor están preparados para altas/incrementos cuando se active el despliegue de límites mediante una futura operación revisada. Superar una capacidad existente no borra datos; reducir o archivar debe seguir siendo posible. El plan manual real sigue separado de la simulación sandbox. No anunciar disponibilidad ilimitada ni activar límites antes de avisar y validar el tratamiento de hogares existentes.

## Imágenes y copyright

- Las fotos privadas y los avatares permanecen en buckets privados; el hogar autorizado recibe acceso temporal. No afirmar cifrado de extremo a extremo.
- El usuario conserva su contenido. La licencia propuesta se limita a alojar, procesar técnicamente y mostrar dentro del servicio; no permite publicidad o entrenamiento de modelos con fotos familiares.
- El cargador necesita derechos del fotógrafo y permisos pertinentes de las personas. Las fotos aportadas por adultos que muestran a niños no convierten automáticamente una aplicación de audiencia general en un servicio que recoge datos directamente de menores de 13; sí requieren privacidad, acceso limitado y análisis del contexto.
- No construir una galería pública ni reutilizar imágenes familiares para marketing.
- Preparar un canal para avisos y contranotificaciones; revisar reclamaciones proporcionalmente, registrar las decisiones y aplicar la política de reincidencia cuando corresponda. El plazo de restitución de 10–14 días hábiles de DMCA es condicional al procedimiento aplicable y ausencia de notificación de acción judicial, no una garantía universal de republicación.

## Fuentes oficiales consultadas

- [Copyright Office — Section 512](https://www.copyright.gov/512/).
- [DMCA Designated Agent Directory FAQ](https://www.copyright.gov/dmca-directory/faq.html) y [tarifas](https://www.copyright.gov/about/fees.html).
- [FTC — Complying with COPPA: Frequently Asked Questions](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions): menores de 13, edad/consentimiento, fotos aportadas por adultos y servicios de audiencia general. No afirmar que una etiqueta «13+» resuelve por sí sola COPPA.
- [California Attorney General — CCPA](https://oag.ca.gov/privacy/ccpa): la aplicabilidad depende de condiciones y umbrales; la política no afirma aplicabilidad universal ni exención automática.
- [15 USC 8403 — ROSCA](https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap110-sec8403.htm): divulgación, consentimiento y mecanismos de cancelación en transacciones en línea con opción negativa. Revisar también las normas estatales aplicables; no basar el contrato en una regla federal de click-to-cancel sin comprobar su vigencia.
- [Stripe — Testing subscriptions](https://docs.stripe.com/billing/testing), [Test clocks API](https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage), [Checkout subscriptions](https://docs.stripe.com/payments/checkout/build-subscriptions), [Customer portal](https://docs.stripe.com/customer-management), [Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks).

Esta lista es un registro de preparación del producto; la revisión jurídica y la decisión de constitución corresponden al futuro operador.
