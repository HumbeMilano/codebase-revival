# Inicio móvil del hogar nuevo

Seguimiento: [#38](https://github.com/HumbeMilano/codebase-revival/issues/38), dentro de [M1 #34](https://github.com/HumbeMilano/codebase-revival/issues/34).

El diseño inicial de una cuenta personal en teléfono da prioridad a tres widgets existentes: tareas de hoy, su lista y próximos eventos. Tareas muestra la siguiente pendiente en el formato ancho; las versiones pequeñas conservan el contador. Un hogar vacío ofrece acciones para añadir una tarea, productos o un evento mediante sus formularios reales.

La agenda mensual, notas y el resto del catálogo siguen disponibles en Personalizar y en sus secciones. No se exige personalizar para comenzar. Las tarjetas no cambian de tamaño al recibir contenido, no se añaden datos de ejemplo y no se restauran recorridos ni carteles explicativos.

La selección móvil solo se aplica al estado inicial sin preferencias guardadas. Los diseños existentes conservan dimensiones, orden y referencias; Restablecer diseño es una acción explícita. Tablets y escritorio conservan su diseño inicial. La navegación por URL de #51 sigue manteniendo sección, referencias, Atrás y recarga.

## Guardado local antes de recargar

La batería completa encontró una recarga inmediatamente después de pulsar Añadir, antes de que IndexedDB confirmara el producto. El producto se muestra y el campo se vacía después del commit. La regresión espera esa confirmación visible; una prueba adicional bloquea una transacción local de verdad y comprueba la cancelación de la recarga, la conservación de la siguiente entrada y el posterior guardado/recarga sin red.

Solo una edición local aún sin confirmar registra el aviso nativo de salida. La cola ya durable puede seguir pendiente de sincronización sin producir ese aviso ni un cartel de funcionamiento. El navegador y el sistema operativo pueden terminar un proceso sin emitir `beforeunload`; no se promete conservar una escritura que todavía no se confirmó. El texto escrito para el siguiente producto no se borra al terminar el anterior.

## Evidencia y límites

La regresión examina hogares vacíos/con datos y adultos/adolescentes a 320, 390, 412, 768 y 1024 CSS px, con Chromium de escritorio y emulación móvil. Comprueba ausencia de desbordamiento horizontal, la acción inicial con teclado, nombres accesibles y ausencia de lecturas financieras sin permiso. Las pruebas existentes verifican guardado, orden, los doce tamaños y la interacción en compras/calendario.

Esto no es una evaluación con lectores de pantalla físicos ni una demostración de comprensión o adopción. Esas comprobaciones y el tiempo hasta el primer resultado siguen en #37/#48. Las capturas usan datos sintéticos y no fotos o registros del propietario.
