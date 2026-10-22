# Roadmap

## Corrección de compras
- [x] Evitar productos duplicados y escrituras repetidas; limpiar copias existentes y exigir unicidad por hogar.
- [x] Verificar añadir, marcar, borrar y sincronizar entre dos navegadores.

## Fase 2 — Backend real (en curso)
- [x] Esquema multi-hogar en la base de datos: hogares, miembros (PIN cifrado), tareas, compras, eventos, notas, bills, repartos, ajustes mensuales y aportes.
- [x] Datos de ejemplo de la Familia Pérez cargados en la base de datos.
- [x] PIN verificado en servidor mediante función de base de datos (verify_pin); los cifrados ya no son legibles desde el navegador.
- [x] Tareas, compras, calendario, notas y finanzas se guardan y sincronizan en tiempo real entre dispositivos.
- [x] Verificado: login con PIN 2222, producto añadido persiste tras recargar, PIN incorrecto no entra.
- [x] Datos aislados por hogar (cuentas y tablets emparejadas).
- [x] Verificar sincronización de compras con dos tablets abiertas a la vez.

## Fase 3 — SaaS
- [x] Registro con correo, crear hogar o unirse con invitación, emparejar tablet por código, desvincular tablets.
- [x] Tareas: crear, editar, eliminar (con deshacer).
- [x] Bloquear finanzas para hijos en la base de datos; PIN adulto concede permiso y cerrar sesión lo revoca (verificado en tablet, incluso reutilizando el permiso anterior).
- [ ] Verificar autorización financiera en cuentas personales: necesita una cuenta de prueba autorizada; la cuenta del solicitante aún no existe.
- [ ] Planes Free / Family Pro: pendiente definir límites, precios y cuenta de cobro; no aplicar restricciones ni cargos inventados.
- [ ] Dictado: pendiente el veredicto del usuario sobre su último intento.
