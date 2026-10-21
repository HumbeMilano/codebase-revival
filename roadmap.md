# Roadmap

## Fase 2 — Backend real (en curso)
- [x] Esquema multi-hogar en la base de datos: hogares, miembros (PIN cifrado), tareas, compras, eventos, notas, bills, repartos, ajustes mensuales y aportes.
- [x] Datos de ejemplo de la Familia Pérez cargados en la base de datos.
- [x] PIN verificado en servidor mediante función de base de datos (verify_pin); los cifrados ya no son legibles desde el navegador.
- [x] Tareas, compras, calendario, notas y finanzas se guardan y sincronizan en tiempo real entre dispositivos.
- [x] Verificado: login con PIN 2222, producto añadido persiste tras recargar, PIN incorrecto no entra.
- [ ] Políticas de acceso son abiertas (demo de un solo hogar); endurecer por hogar cuando llegue el SaaS multi-cuenta.
- [ ] Verificar sincronización en vivo con dos navegadores abiertos a la vez.

## Fase 3 — SaaS
- [ ] Registro de hogares, invitaciones y emparejamiento de tablet por código.
- [ ] Roles y permisos reales por hogar; planes Free / Family Pro.
