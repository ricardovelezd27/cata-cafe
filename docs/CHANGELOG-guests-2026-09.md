# Invitados: perfil visible y "termina de crear tu cuenta" — 26 de septiembre de 2026 (lenguaje llano)

Resumen no técnico del arreglo enviado el 26 de septiembre de 2026 (PR #23, rama
`claude/mobile-profile-routing-bug-0a7579`). El detalle técnico vive en `CLAUDE.md`
("Guests (anonymous users)") y en `docs/flows.md` ("Guest scope in the app shell").

## Qué estaba mal

En el celular, al tocar **Perfil** aparecía la página de **Sesiones**. No era un error
del menú: quien entra a una cata por el código QR usa una cuenta *anónima* (invitado), y
la app enviaba a cualquier invitado que intentara abrir una página fuera de una lista
corta (catar, sala de espera, resultados, lista de sesiones, inicio) de vuelta a
Sesiones, sin explicar nada. Perfil, Cafés y Grupos estaban fuera de esa lista, así que
los tres botones "no hacían nada" para un invitado. Las cuentas registradas (por ejemplo
la del organizador) nunca pasaban por ahí, por eso a Ricardo sí le funcionaba.

## Qué cambia, por usuario

### Invitado por QR

- **Perfil abre su perfil.** Es la misma página que ve cualquier usuario (banner, nombre,
  estadísticas, nivel, actividad reciente, sección Cuenta). Donde iría el correo dice
  "Invitado", junto al nombre hay una etiqueta "Invitado", y aparece un botón
  **"Terminar de crear tu cuenta"** (arriba y en la sección Cuenta).
- **Cafés, Grupos, "Nueva sesión" y los enlaces a un café** no cambian de página: abren
  un aviso "Termina de crear tu cuenta" que explica que como invitado solo ve su perfil y
  las sesiones a las que lo invitaron, con dos opciones: **Crear cuenta** o **Ahora no**.
- **Crear cuenta** usa el mismo camino que ya existía en la página de resultados
  ("Guarda tus resultados"): correo o Google, confirmación, y sus catas quedan vinculadas
  a la cuenta nueva o existente. Al terminar vuelve a la página que quería abrir.
- Si escribe a mano una dirección de una zona vedada (p. ej. `/app/coffees`), sigue
  llegando a Sesiones, pero ahora con el mismo aviso abierto en vez de un rebote mudo.
- El historial de cafés del perfil también se puede abrir.

### Usuario registrado

- Nada cambia: mismo menú, misma página de perfil, ningún aviso.
- **Arreglo adicional:** la pestaña activa del menú (abajo en celular, izquierda en
  escritorio) ahora se resalta en español. Antes solo se resaltaba en inglés, por cómo se
  construye la dirección de las páginas en español (sin el prefijo `/es`).

### Organizador

- Nada cambia en sus flujos. Los invitados de sus catas ya no le preguntarán "¿por qué
  Perfil me manda a Sesiones?".

## Qué sigue igual

- Un invitado sigue sin poder crear cafés, grupos ni sesiones: el límite está en el
  acceso, no en la forma de la página. La barrera del servidor (`proxy.ts`) sigue ahí; el
  aviso solo la hace visible.
- No hay cambios en la base de datos ni pasos manuales en Supabase o Vercel. El
  despliegue es el normal: fusionar a `main` y Vercel publica.

## Cómo comprobarlo en producción (2 minutos)

1. Con una cuenta registrada, en el celular: tocar Perfil → se ve el perfil; tocar
   Cafés → se abre la lista de cafés; la pestaña actual se ve resaltada.
2. En una ventana privada, entrar por el enlace/QR de una sesión de prueba como
   invitado, tocar Perfil → se ve el perfil con "Invitado" y el botón "Terminar de
   crear tu cuenta"; tocar Cafés → aparece el aviso y la página no cambia.
