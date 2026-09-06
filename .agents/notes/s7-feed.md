# S7 — Feed de actividad (fan-out-on-read)

**Estado:** implementado 6 sep 2026, sin commitear y sin desplegar. Solo frontend: no toca
`firestore.rules`, ni `firestore.indexes.json`, ni `functions/`. El despliegue es
`firebase deploy --only hosting`.

El registro largo (decisiones, coste medido, desviaciones respecto al texto de la tarea) está en el
doc del proyecto `claude/social-roadmap.md`, entrada **S7** del status log. Esta note es solo el
traspaso.

## Qué se añadió

- `frontend/src/services/feedService.js` — merge reader (una query por autor, k-way merge con
  refill solo del buffer que se vacía), agrupación de tarjetas, `boardGameFromEvent`, `timeAgo`.
  Todo lo de arriba de `fetchUserActivityPage` recibe `fetchPage` inyectado y se testea sin emulador.
- `frontend/src/hooks/useFeed.js` — una sesión de feed: reader, caché de `public_profiles`, sondeo
  al recuperar el foco. `enabled` la apaga fuera de `/feed`.
- `frontend/src/components/FeedPage.jsx` — la página.
- `computeFeedSources` en `relationshipService` + `feedSources` en `useRelationships`.
- `App.jsx`: ruta `/feed`, botón `Rss` en las dos barras, redirección por defecto desde `/` una vez
  por sesión, y `handleAddGameFromFeed` (usa `ensureGameOnBoard`, **nunca** `addGameToBoard`: añadir
  un juego que ya tienes es un *move* en los builders puros).
- `tests/feed.test.mjs` (24 casos) y un caso nuevo de reglas (página con cursor).

## Dos trampas que costaron el diseño

1. **El cursor es un `DocumentSnapshot`, no un `createdAt`.** S5 sella todos los eventos de una misma
   escritura con la misma hora de servidor; `startAfter(timestamp)` se salta los hermanos. Por lo
   mismo, el orden en cliente desempata por id (`compareEvents`).
2. **Los autores son `following`, no `friends`.** La regla `canViewActivity` pregunta si *yo* le sigo
   a *él*. Exigir seguimiento mutuo vaciaría el feed sin motivo.

## Revisión (segundo agente, no se revisa el propio trabajo)

Seis defectos reales, todos corregidos antes del commit. El detalle está en el roadmap; los dos que
importan:

1. **El feed era clicable antes de que existiera el modelo del tablero.** Como `/feed` es ahora la
   landing por defecto, `data` seguía siendo `INITIAL_DATA` y "+ Backlog" añadía una **segunda copia**
   de un juego que ya tenías, en la columna `backlog` — que la cuenta puede haber renombrado, con lo
   que `toBoardView` lo dejaba fuera de la vista. Ahora el botón no existe hasta `isBoardReady` y el
   handler se niega mientras `isDataLoading`.
2. **El desempate del cliente no coincidía con el de Firestore.** `localeCompare` intercala
   mayúsculas y minúsculas; el `__name__` implícito del SDK ordena por bytes. Cada página se
   reordenaba a un orden que el cursor (`DocumentSnapshot`) no comparte. Ahora es `<`/`>`, con un
   test que fija el orden exacto.

Los otros cuatro: parpadeo del estado vacío al entrar en `/feed`, la redirección por defecto podía
dispararse segundos tarde (ahora acotada a los 8 s posteriores a abrir la app, y el latch se libera
al cerrar sesión), una lectura fallida de `public_profiles` envenenaba la caché para toda la sesión,
y `stats.queries` no contaba las queries denegadas.

## Verificación

- `cd tests && npm run test:unit` → **140/140**.
- `cd tests && npm test` → **98/98**, ejecutado el 6 sep contra las reglas actuales. Esto además
  cierra el pendiente de S5 (la suite de reglas no se había vuelto a ejecutar desde que se
  reescribieron).
- `npm run lint` y `vite build` en `frontend/` pasan.

## Lo que falta (no se ha clicado nada)

No existe todavía ningún evento de actividad en el proyecto: ningún trigger se ha observado
disparándose (pendiente 2 del bloque de despliegue del roadmap). Hasta que eso ocurra el feed no
tiene nada que mostrar. Recorrido pendiente: dos cuentas que se siguen, generar eventos en una,
abrir `/feed` en la otra, pasar de 30 tarjetas, dejar de seguir y ver desaparecer al autor, bloquear
e igual, "+ Backlog" sobre un juego que ya tienes (no debe moverlo) y sobre uno que no, el sondeo al
volver el foco, y el estado vacío en una cuenta nueva.
