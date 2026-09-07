# QA pendiente entre `main` y producción

**Estado:** `main` y producción están sincronizados en `firestore.rules`, `hosting` y functions a
2026-09-07 (`firebase deploy` completo, sin `--only`, tras mergear PR #14 / issue #9 — sin cambios
en `firestore.rules` ni `functions/` en este PR, así que el deploy fue de refresco, no de contenido
nuevo en esas dos capas). Smoke check tras el deploy: `https://gengemztest-9582e.web.app` responde
y, con la sesión de navegador ya autenticada, el onboarding paginado abre en Quest 1 con el
contenido real de #9 (título "¿A qué estás jugando?", buscador, copy de "Currently Playing") — no
se interactuó más con ese modal (no se buscó ni se añadió ningún juego) para no escribir sobre una
cuenta real ajena a la verificación.

## Issue #9 — Quest 1, buscador de juegos (PR #14)

QA funcional con 6/6 criterios verificados contra Firestore/Functions emulators reales (comentario:
https://github.com/carlos-tormo/gengemz/pull/14#issuecomment-5571588048). Hallazgo de
infraestructura no bloqueante: la clave RAWG en `functions/.secret.local` está caducada (401 real
contra `api.rawg.io`, confirmado en el log del emulador) — abierto como issue propio, #15
(Backlog); mientras tanto cualquier búsqueda real en producción devolverá error hasta que se
renueve.
Desplegado hoy junto con el resto — sin desfase pendiente para este issue.

---

## Histórico

### Deploy de #8 (PR #13), 2026-09-07

`main` y producción sincronizados en `firestore.rules`, `hosting` y functions
(`firebase deploy` completo, sin `--only`, tras mergear PR #13 / issue #8). Incluye
además el `chore: link project board` (8d572b2) que se había quedado sin subir a `origin/main` en
una sesión anterior — `/deploy` lo detectó al fallar el fast-forward, lo reconcilió con un merge de
`origin/main` en local y lo empujó junto con el merge de #13. Smoke check tras el deploy:
`https://gengemztest-9582e.web.app` responde 200 y, con la sesión de navegador ya autenticada, el
onboarding paginado ("Your Quest Log", Quest 1 de 4) se abre solo, confirmando que el feature de
#8 está vivo en producción — no se interactuó más con ese modal para no escribir sobre una cuenta
real ajena a la verificación.

## Issue #8 — onboarding quest shell (PR #13)

QA funcional con 7/7 criterios verificados (comentario:
https://github.com/carlos-tormo/gengemz/pull/13#issuecomment-5570194160). El criterio de escritura
del flag (`settings.questOnboardingCompleted`) reveló un fallo real de `firestore.rules`
(`validSettings()` no admitía el campo nuevo) que se arregló en el mismo PR, con test de reglas.
Desplegado hoy junto con el resto — sin desfase pendiente para este issue.

**Deploy parcial, no `firebase deploy` completo**: el primer intento (`firebase deploy` sin
`--only`) falló en el paso de functions con `Error: User code failed to load. Cannot determine
backend specification. Timeout after 10000` — no relacionado con este PR (S9 no toca `functions/`).
Se repitió con `--only firestore:rules,hosting`, que sí completó. Las Cloud Functions en producción
siguen siendo las del deploy de S8 (PR #4), sin cambios pendientes de S9 porque S9 no las tocó — pero
el timeout en sí es un hallazgo nuevo de proceso: el próximo PR que sí cambie `functions/` se topará
con el mismo bloqueo. Candidato a issue propio (revisar `firebase-functions` desactualizado, que el
propio deploy avisó: `package.json indicates an outdated version of firebase-functions`).

## S9 — gate de escrituras sociales a cuentas no anónimas (PR #7, issue #6)

- Rules: `isRealUser()` + gate en `validFollowing/Followers/Requests/Blocked/PlaylistCreate/PlaylistUpdate`.
  Verificado con 117 tests de rules contra el emulador de Firestore (`cd tests && npm test`), en
  verde en el HEAD del merge, y desplegado a producción hoy (ver "Estado" arriba).
- Criterio de UI (botón seguir/pedir visible para anónimos, abre login) sí se click-testeó en vivo
  con Playwright — pero **no contra el proyecto Firebase real**: como no hay wiring de emuladores en
  `frontend/src/config/firebase.js` (ver "Deuda de proceso" más abajo, ya conocido desde S7), el QA
  aplicó un parche temporal *no commiteado* para apuntar `npm run dev` a los emuladores, capturó las
  evidencias, y lo revirtió antes de terminar (`git checkout --` sobre `firebase.js`, `vite.config.js`,
  `firebase.json`). El comportamiento en el sitio real desplegado (`gengemztest-9582e`, ya con el
  hosting y las rules de hoy) **sigue sin verificarse clic a clic**.
- Primer paso para cerrar esto: abrir https://gengemztest-9582e.web.app con una sesión anónima nueva
  (pestaña privada), navegar a `/u/<uid-publico>` y confirmar que el botón "Follow"/"Request to
  follow" está visible y que al pulsarlo se abre el popup de Google en vez de escribir en Firestore
  (que además debería fallar con permission-denied si algo se coló).

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
- **Vehículo alternativo probado en el QA de #8** para los criterios que dependen de
  Firestore/Auth sin ese wiring: un script Node (`node --import <loader-esm>`) que reemplaza, vía
  un hook de módulos (mismo patrón que ya usa `tests/loader.stubs.mjs` para las Cloud Functions),
  la resolución de `frontend/src/config/firebase.js` por una versión conectada a los emuladores
  reales (`connectFirestoreEmulator`/`connectAuthEmulator`), e importa y ejecuta las funciones
  reales de `frontend/src/services/*.js` contra ellos, con usuarios de prueba creados en el propio
  emulador. No sustituye el click-testing de UI, pero cubre gating/escritura/persistencia sin
  tocar el proyecto real ni reimplementar la lógica de negocio. El script no se comiteó (vivió en
  `/tmp` durante el QA); si esto se repite a menudo, vale la pena convertirlo en un fixture
  reutilizable bajo `tests/` en vez de rehacerlo cada vez.
