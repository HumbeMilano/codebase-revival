# HomeHub: lo que falta y los extras posibles

## A. Lo que falta para terminar (prioridad alta)

1. **Verificar cuentas reales de punta a punta**: registro, confirmación por correo, entrada, invitación, unión al hogar. Probar con una cuenta adulta y una de hijo.
2. **Finanzas protegidas desde el móvil personal**: confirmar que un hijo con su propia cuenta no ve nada y que la autorización con PIN de un adulto funciona y termina al salir.
3. **Gestión de miembros desde la app**: añadir, editar, quitar miembros, cambiar PIN y rol (hoy los miembros vienen sobre todo de la demo).
4. **Vincular cuenta con miembro**: elegir qué persona del hogar es cada cuenta al aceptar la invitación.
5. **Calendario y Notas guardados de verdad**: hoy solo duran la sesión; pasarlos a la base de datos con sincronización.
6. **Revisión de seguridad**: análisis automático, quitar los permisos abiertos que quedan de la demo, límite de intentos de PIN (bloqueo tras varios fallos).
7. **Dictado por voz**: decidir con una última prueba tuya si se queda o se desactiva.
8. **Errores y estados vacíos**: mensajes claros sin conexión, al fallar un guardado y en pantallas sin datos.
9. **Publicar** la app y probarla en la tablet y en los teléfonos reales.

## B. Mejoras recomendadas (prioridad media)

- **Tareas recurrentes y puntos/recompensas** para los niños.
- **Recordatorios** de facturas próximas a vencer y de eventos (avisos en el teléfono).
- **Modo sin conexión** para la tablet, con sincronización al volver.
- **Instalar como app** en tablet y teléfonos (icono en pantalla de inicio, pantalla completa).
- **Historial de finanzas**: comparar meses, exportar a hoja de cálculo o PDF.
- **Adjuntar foto del recibo** a cada factura.
- **Modo oscuro nocturno** en la tablet con brillo bajo automático.
- **Registro de actividad**: quién marcó, pagó o borró algo.

## C. Extras (prioridad baja / futuro SaaS)

- **Planes de pago** (Gratis / Familia Pro) con cobro mensual.
- **Varios hogares por cuenta** (por ejemplo, padres separados).
- **Calendario de Google** sincronizado.
- **Menú semanal** que genere la lista de compras.
- **Clima y fotos familiares** en el kiosco.
- **Asistente** que resuma la semana o sugiera tareas.
- **Idioma inglés** en toda la app.
- **Panel de administración** del servicio (hogares, uso, soporte).

## Orden propuesto

```text
1) Cuentas reales + miembros (A1-A4)
2) Calendario/Notas persistentes (A5)
3) Seguridad y errores (A6, A8)
4) Voz (A7) y publicar (A9)
5) Mejoras B, luego extras C
```

## Detalles técnicos

- A3/A4: RPCs SECURITY DEFINER para gestionar miembros y PIN (hash pgcrypto); enlazar household_accounts con member_id.
- A5: tablas events/notes con household_id, RLS vía current_household_ids(), usePersistedCollection y polling en modo tablet.
- A6: tabla de intentos de PIN con bloqueo temporal dentro de verify_pin; linter y escaneo de seguridad.
- B: notificaciones push requieren app instalable (service worker solo en producción).
- C: pagos con Stripe/Paddle; Google Calendar vía conector.
