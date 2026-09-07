# QA pendiente entre `main` y producción

**Estado:** `main` y producción están sincronizados a 2026-09-07 (deploy de S8, PR #4,
`firebase deploy` completo — hosting + firestore rules + functions, incluye por primera vez
`firestore.rules` y Cloud Functions nuevas desde S7). Esta note registra lo que `/deploy` no pudo
verificar en esa pasada, no un desfase de código.

## S8 — notificaciones in-app (PR #4, issue #3)

- Criterios de backend (1-3, 6, 7) verificados en vivo contra los emuladores reales
  (Firestore+Functions+Auth), no solo contra la suite de tests — detalle en el comentario de QA:
  https://github.com/carlos-tormo/gengemz/pull/4#issuecomment-5568139012.
- Criterios de UI (badge, listado, marcar leído al abrir) **no click-testeados en vivo** — mismo
  bloqueo de siempre (ver "Deuda de proceso" más abajo). Cubiertos por revisión de código.
- **Hallazgo real durante el QA**: `functions/notifications.js` lanzaba `TypeError` la primera vez
  que un trigger se ejecutaba de verdad contra el emulador de Functions
  (`admin.firestore.FieldValue` pierde el estático bajo el proxy de desarrollo de firebase-tools).
  Arreglado con la API modular (`firebase-admin/firestore`) antes de mergear. **Sin confirmar si el
  mismo fallo ocurre en el runtime real de Cloud Functions** (el proxy de desarrollo no existe ahí);
  revisados los logs de producción tras el deploy de hoy y no hay ninguna ejecución real de
  `onGameWritten`/`onPublicPlaylistCreated` con o sin error — siguen sin haberse disparado nunca con
  datos reales, así que la duda queda abierta. Ver #5 (fuera de alcance de S8, mismo patrón en
  `activity.js` de S5).
- Primer paso para cerrar esto: seguir la playlist de recorrido de S7 (más abajo) y, además, generar
  una solicitud de seguimiento real entre dos cuentas de prueba, aceptarla, y confirmar en
  `/notifications` que las tres notificaciones aparecen y el badge baja a 0 al abrir.

## S7 — feed de actividad (PR #2)

- No hay issue de GitHub para S7 ni tablero en el proyecto todavía, así que
  `/qa-funcional` no pudo ejecutarse contra un contrato de criterios de
  aceptación con evidencias por criterio.
- **No se ha hecho click-testing en vivo del feed.** Se descubrió que
  `npm run dev` no tiene wiring de emuladores
  (`connectFirestoreEmulator`/`connectAuthEmulator` no existen en
  `frontend/src/config/firebase.js`): la app en local habla directamente
  contra el proyecto Firebase real (`gengemztest-9582e`), el mismo que sirve
  producción. Generar eventos de prueba ahí escribiría datos reales, y se optó
  por no hacerlo en esta pasada — ver decisión en el hilo de PR #2.
- Lo verificado en su lugar: `test:unit` 140/140, reglas 98/98 contra el
  emulador de Firestore, build y lint limpios, revisión de código sin
  bloqueantes (comentario en PR #2).
- **Ningún evento de actividad ha existido nunca** en el proyecto (S5 lo
  introdujo pero nadie ha disparado el trigger), así que el feed nunca se ha
  visto renderizar con datos reales. Primer paso para cerrar esto: generar
  eventos reales en una cuenta de prueba (añadir, arrastrar a Currently
  Playing, valorar dos veces en menos de 10 min, favoritear, arrastrar a
  Victory Road, crear una playlist pública) y confirmar en `/feed` que las
  tarjetas aparecen agrupadas como se espera.

## Deuda de proceso a resolver

- El tablero del proyecto (`Project`) sigue sin crearse — `/new-project` lo
  pendiente.
- No hay wiring de emuladores en el frontend: mientras no exista, cualquier
  QA funcional con UI de este proyecto escribe contra el proyecto Firebase
  real. Vale la pena decidir si se añade (`import.meta.env.DEV` + flag) o si
  se acepta que el QA funcional siempre corre contra cuentas de prueba en el
  proyecto real.
