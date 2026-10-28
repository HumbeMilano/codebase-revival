# Instalaciones independientes

| Instalación   | Dirección                 | Identificador     | Sesión                                |
| ------------- | ------------------------- | ----------------- | ------------------------------------- |
| Skendal       | https://app.skendal.com   | `/` (se conserva) | Clave Auth original                   |
| Skendal Admin | https://admin.skendal.com | `/skendal-admin`  | Espacio Auth propio de administración |

Las dos direcciones reutilizan el Worker `skendal-app`, el backend existente y los planes Free. El Worker selecciona el documento inicial, manifiesto, favicon y service worker según el hostname. `run_worker_first` debe estar activo para que esa selección ocurra también en las solicitudes de archivos estáticos. La instalación administrativa tiene su propio icono con distintivo A. No es necesario quitar la instalación del hogar ni borrar su almacenamiento.

Los orígenes separan el almacenamiento del navegador, las sesiones y las cachés. Además, administración utiliza una clave Auth y un prefijo de caché distintos. Cerrar sesión usa `scope: local`; no revoca las sesiones de la otra instalación. Los service workers guardan archivos estáticos, nunca respuestas de Auth o de las API privadas. La aplicación del hogar mantiene sus preferencias, colas y listas locales existentes.

La separación por dominio no concede permisos. La administración sigue comprobando el rol protegido `platform_admin`, y sus operaciones usan los RPC administrativos. Una cuenta del hogar no obtiene acceso al panel ni ve creación de hogares allí. Los antiguos enlaces `/admin` redirigen al dominio administrativo sin copiar tokens, códigos Auth, correos o parámetros arbitrarios. Tampoco se migran sesiones automáticamente entre instalaciones.

En Supabase Auth, conservar `Site URL` en `https://app.skendal.com` y las direcciones ya autorizadas; añadir `https://admin.skendal.com/**` a `Redirect URLs`. Cada formulario de recuperación vuelve a `/reset-password` en su propio origen. No cambiar el Relying Party ID de los passkeys del hogar, que continúa en `app.skendal.com`.

Los retornos del Checkout administrativo de sandbox vuelven a `admin.skendal.com`. Las suscripciones familiares continúan en la app del hogar y el webhook existente no se traslada. Los cargos reales siguen deshabilitados.

`bun run test:pwa` comprueba ambos orígenes contra el Worker local, en un mismo contexto de navegador, con HTTP de Auth y hogares sintético. Cubre manifiestos e iconos instalables, service workers separados, sesiones simultáneas, cierres de sesión independientes, rechazo de cuentas sin permiso, enlaces antiguos y recuperación. El resto de la aplicación mantiene `bun run test:e2e`.
