# QA pendiente entre `main` y producción

**Estado:** `main` y producción están sincronizados a 2026-09-07 (deploy de S7,
commit `482fc71`, `firebase deploy --only hosting`). Esta note registra lo que
`/deploy` no pudo verificar en esa pasada, no un desfase de código.

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
