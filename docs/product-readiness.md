# Skendal: evaluación de producto, adopción y venta

Fecha: 29 de octubre de 2026. Hito activo: [M1 #34](https://github.com/HumbeMilano/codebase-revival/issues/34). Entrega inicial: [auditoría #35](https://github.com/HumbeMilano/codebase-revival/issues/35).

## Diagnóstico

Mantendría Skendal en preparación privada. Tiene funciones útiles y una base técnica trabajada, pero todavía exige demasiada administración manual para demostrar que reduce la carga de coordinar una casa. El siguiente avance debe conseguir que una familia nueva obtenga un resultado, involucre a otra persona y vuelva por utilidad propia.

Esta es una evaluación independiente de producto. No es un estudio de mercado ni afirma que las familias hayan rechazado el servicio. El propietario ya usa la aplicación; su uso no demuestra por sí solo adopción fuera de ese contexto.

## Método y límites

- Revisión de `main` en el commit `54c2450d1f40f61b9418fe416e19ec0f2c4c6eec`, antes de esta documentación.
- Ocho recorridos en los archivos realmente publicados: primer acceso sin hogar, inicio vacío/formulario de tarea, navegación/recarga y CTA de la landing; móvil y escritorio. Todos completaron la captura final. Se corrigieron selectores del instrumento de revisión; esos fallos iniciales no se contabilizan como defectos del producto.
- Auth y datos del hogar simulados mediante el backend de pruebas existente. Sin cuentas privadas, cambios de hogares reales, correos, tarjetas, cobros ni seguimiento de usuarios.
- Información oficial publicada por Cozi, FamilyWall y AnyList. No se evaluaron exhaustivamente sus apps ni se infieren cuotas o precios de sus funciones.
- Sin entrevistas ni contacto a familias. Falta comprobar paneles nativos de contraseña, instalación y uso sostenido con dispositivos y personas reales.

La [evidencia estructurada](product-readiness-evidence.json) contiene observaciones reproducibles. Ocho comprobaciones técnicas correctas no significan ocho usuarios satisfechos.

## Valor sobre el que construir

Las compras compartidas sin conexión resuelven un problema concreto del supermercado. La combinación de teléfono personal y tablet existente permite dejar información del hogar a la vista sin comprar un aparato dedicado. Finanzas, agenda y tareas en un mismo hogar pueden evitar cambios de herramienta. La separación de permisos, fotos privadas y sesiones independientes de administración son bases de confianza.

Ese potencial necesita comprobarse en un uso cotidiano. No asumiría que personalizar widgets o subir más fotos motive por sí solo una suscripción.

## Observaciones y consecuencias

| Observación                                                                               | Evidencia                                                                                                                                         | Efecto probable y siguiente paso                                                                                                                             |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primer acceso sin hogar usa el mensaje de cuenta desvinculada                             | En ambos tamaños se muestra «Acceso a tu cuenta» y una explicación de revisión del vínculo antes de crear hogar                                   | Una persona nueva puede creer que ocurrió un error. Distinguir primera entrada e invitación de una desvinculación sin restaurar accesos automáticamente. #37 |
| Se pide PIN antes de la primera utilidad                                                  | `SetupHousehold` y sus RPC requieren cuatro dígitos; el formulario publicado lo incluye                                                           | Quien solo quiere usar el teléfono debe entender otra credencial. Revisar momento y propósito sin debilitar autorización. #37                                |
| El inicio vacío dedica mucho espacio a ausencia de contenido                              | Móvil 412×839: seis widgets y documento de unos 1629 CSS px; tarjetas de compras, eventos y notas vacías                                          | Acciones útiles y jerarquía inicial antes de personalización. La longitud sola no demuestra abandono. #38                                                    |
| Las secciones no tienen dirección propia                                                  | `HubShell` usa estado local para `tab`. Abrir Notas conserva `/` y recargar vuelve a Inicio en móvil/escritorio                                   | Se pierde orientación y no se puede regresar/compartir un destino como en una app normal. #38                                                                |
| Las rutinas se capturan como elementos únicos                                             | `Chore`/`FamilyEvent` sin regla de repetición; el formulario real de tarea tiene título, persona y fecha                                          | Recrear tareas añade trabajo. Introducir ocurrencias repetidas con historial y excepciones. #39                                                              |
| Los recordatorios no entregan avisos fuera de la app                                      | Sin suscripción/handler push ni entrega programada de recordatorios en el código revisado                                                         | Alguien debe recordar abrir la app o avisar a otra persona. Diseñar entrega real, preferencias y compatibilidad. #40                                         |
| Hay que volver a introducir agendas                                                       | No se encontró ICS ni integración de calendarios                                                                                                  | La migración puede exigir demasiado trabajo. Empezar por importación/exportación privada y explícita. #41                                                    |
| La lista solo estructura nombre y completado                                              | `ShopItem`; la cola durable ya protege el guardado                                                                                                | Validar captura rápida, cantidades opcionales y reutilización conservando listas independientes. #42                                                         |
| Pagos estimados entran en los totales de pagado                                           | `billStatus` considera vencida una factura `autoPay`; `monthSummary` la suma en `paid`/`available`. La tarjeta individual sí dice «Pago estimado» | Separar proyección y pago confirmado en todas las superficies, sin reescribir historia ni afirmar conexión bancaria. #43                                     |
| La web y la instalación tienen marca/idioma más completos que algunos recorridos internos | App con cadenas españolas; invitaciones todavía con HomeHub                                                                                       | Una familia que llega desde la landing inglesa recibe otra expectativa. Completar EN/ES y marca. #44                                                         |
| Fallos temporales pueden desmontar un hogar válido                                        | `HubApp.reload` invalida en el catch; el PR #10 no está integrado                                                                                 | Riesgo de confianza. Reproducir y adaptar la corrección sobre el código actual. #36                                                                          |
| La landing invita a conocer precios antes de empezar                                      | CTA principal «Conoce el plan gratis» apunta a `#plans`; «Abrir app» llega al login                                                               | Cuando corresponda al estado de preparación, llevar el CTA de comienzo al registro y medirlo. #49                                                            |

Las consecuencias de adopción son hipótesis a contrastar. La presencia de pantallas, el comportamiento de recarga y las ausencias de código son observaciones concretas.

## Tres motivos de abandono que priorizaría

1. **Añade trabajo antes de ahorrarlo.** Cuenta, correo, hogar, PIN y datos antes del beneficio compartido. La primera utilidad no debe exigir aprender la configuración.
2. **Depende de memoria y captura manual.** Sin rutinas ni avisos reales, Skendal almacena lo que alguien introduce, pero ayuda poco a mantener el hogar al día entre visitas.
3. **No siempre conserva contexto o transmite certeza.** Regreso a Inicio, errores de sesión y pagos estimados en resúmenes pueden provocar dudas sobre dónde estoy o si puedo confiar en lo que veo.

No se corrigen esos puntos solo reduciendo precio o ampliando widgets. Son prioridades del diagnóstico, no razones expresadas por participantes entrevistados.

## Público y posicionamiento inicial

Mantener Estados Unidos, inglés/español y límites 13+/18+ ya elegidos. El primer segmento a estudiar sería un hogar de adultos y adolescentes que comparte compras, fechas y responsabilidades; con tablet opcional. No prometer acceso de menores de 13 al hablar genéricamente de «toda la familia».

La alternativa es el conjunto de herramientas que la familia ya maneja: calendario, notas, lista y mensajería. Cambiar exige mostrar menos coordinación manual, además de reunir información.

La categoría ya tiene soluciones: [Cozi](https://www.cozi.com/feature-overview/) presenta agenda, recordatorios y listas; [FamilyWall](https://www.familywall.com/) presenta sincronización de calendario y también Home Hub; [AnyList](https://www.anylist.com/) destaca listas compartidas y rapidez de captura. No vender la tablet como una exclusividad demostrada. [Cozi documenta además el uso con otras agendas](https://www.cozi.com/using-cozi-with-other-calendars/).

Dirección a validar: «Tu hogar al día, sin que todo dependa de una persona». No publicar promesas de avisos/automatización aún pendientes. La demostración debe enseñar a dos personas coordinándose en una situación concreta y con datos ilustrativos.

## Experiencia objetivo

Una persona entiende qué problema resuelve Skendal, crea su hogar y añade una compra o tarea. La otra acepta una invitación y actúa sobre ese mismo elemento. La próxima visita muestra lo que importa hoy. Una rutina crea su siguiente ocurrencia y un aviso autorizado llega sin obligar a vigilar la app.

Es una experiencia propuesta. La primera utilidad no requiere elegir tamaños de widgets, subir fotos o instalar la PWA. Tablet/PIN tienen una finalidad comprensible; cualquier cambio de seguridad exige diseño y pruebas. Los estados vacíos ofrecen acciones, sin tour ni datos ficticios insertados en el hogar.

El objetivo propuesto de cinco minutos cuenta interacción; la espera del correo se registra separadamente. Solo un participante observado puede validar que el proceso se entiende sin explicación.

## Free, Pro y sostenibilidad

Mantener lo acordado: USD 2.99/mes y USD 5.99/año, editables; 10/30 fotos; límites comerciales desactivados durante preparación. El informe no cambia catálogo ni derechos existentes.

USD 5.99/año equivale a unos USD 0.50/mes de ingreso bruto y un descuento aproximado de 83% frente a doce mensualidades de USD 2.99. Aplicando solo la tarifa estándar publicada de [Stripe para tarjetas domésticas en EE. UU.](https://stripe.com/pricing), 2.9% + USD 0.30, quedarían unos USD 5.52 por cobro anual antes de Billing, impuestos, devoluciones, soporte e infraestructura. No es margen neto ni afirma la tarifa contractual de una cuenta particular.

El precio puede ser deliberado, pero debe contrastarse con valor y costes. Pro necesita beneficios que una familia quiera, como capacidades y coordinación adicionales, cuando existan. Recuperación, privacidad y seguridad no deberían convertirse en obstáculos comerciales. Evaluar si cuatro miembros Free excluye a hogares que queremos captar antes de que perciban utilidad.

Mantener infraestructura Free exige observar capacidad. [Supabase](https://supabase.com/pricing) publica 1 GB de Storage y no incluye respaldos automáticos en Free. Considerar fotos, avatares, descargas de tablet, correos y operaciones; no prometer coste cero para cualquier número de hogares. Usar tamaños y consumos medidos, umbrales y un límite de incorporación. El plan gratuito no elimina comisiones de pago o trámites externos.

Las transiciones de suscripción ya se probaron en sandbox; no hay que reconstruirlas desde cero. Venta real y derechos Pro efectivos requieren un cambio separado después de empresa, condiciones y verificaciones. #45 y #46.

## Orden de trabajo

| Etapa                    | Tareas             | Resultado para avanzar                                                                 |
| ------------------------ | ------------------ | -------------------------------------------------------------------------------------- |
| Confianza y primer valor | #36, #37, #38, #43 | Acceso estable, primera acción comprensible, navegación normal y cifras interpretables |
| Coordinación cotidiana   | #39, #40, #41, #42 | Menos captura repetida, avisos verificados e incorporación de hábitos existentes       |
| Audiencia y operación    | #44, #46, #47      | EN/ES completo, procedimientos y operador preparados                                   |
| Oferta y comunicación    | #45, #49           | Valor Free/Pro y demostración coherentes con funciones publicadas                      |
| Adopción                 | #48                | Hogares y dispositivos reales producen evidencia de utilidad y fricciones              |

El orden no promete ejecución simultánea ni una fecha. La siguiente implementación es #36, adaptando sesiones a recuperación y PWA actuales. El informe y el seguimiento son la primera entrega de M1.

No ampliaría ahora chat, recetas, localización, IA, integración bancaria o widgets sin observar que bloquean el caso cotidiano. Mantener las decisiones: sin tour, sin dictado propio y sin carteles de comportamiento rutinario.

## Piloto y definición de terminado

Preparar cinco hogares voluntarios durante catorce días; contacto/invitación requiere autorización del propietario. No se inicia una campaña desde este informe. Registrar primer resultado, segundo miembro, uso compartido, regreso, intervención del fundador y motivos de abandono.

Regla interna inicial: cuatro de cinco hogares consiguen primer resultado sin explicación y tres de cinco vuelven voluntariamente en la segunda semana. No son referencias universales ni validación estadística; los resultados pueden llevar a reducir alcance o cambiar propuesta.

Medir activación compartida y regreso por hogar, además de registros o instalaciones. Empezar con observación/registro manual consentido; la telemetría posterior tendrá eventos mínimos, retención y propósito definidos, sin contenido privado ni publicidad.

Cada tarea enlaza evidencia y criterio. Distinguir código, publicación, dispositivo y hogares. CI no cierra requisitos físicos. La empresa constituida sigue siendo condición del propietario para apertura; los borradores no son contratos vigentes.
