# Roadmap

## Fase 2 — Backend real (en curso)
- [x] Esquema multi-hogar en la base de datos: hogares, miembros (PIN cifrado), tareas, compras, eventos, notas, bills, repartos, ajustes mensuales y aportes.
- [x] Datos de ejemplo de la Familia Pérez cargados en la base de datos.
- [x] PIN verificado en servidor mediante función de base de datos (verify_pin); los cifrados ya no son legibles desde el navegador.
- [x] Tareas, compras, calendario, notas y finanzas se guardan y sincronizan en tiempo real entre dispositivos.
- [x] Verificado: login con PIN 2222, producto añadido persiste tras recargar, PIN incorrecto no entra.
- [x] Datos aislados por hogar (cuentas y tablets emparejadas).
- [ ] Verificar sincronización en vivo con dos navegadores abiertos a la vez.

## Fase 3 — SaaS
- [x] Registro con correo, crear hogar o unirse con invitación, emparejar tablet por código, desvincular tablets.
- [x] Tareas: crear, editar, eliminar (con deshacer).
- [ ] Bloquear finanzas para hijos también a nivel de base de datos (hoy se oculta en pantalla).
- [ ] Planes Free / Family Pro.
