# QA funcional — issue #3 (S8, notifications in-app)

Sin UI (criterios técnicos/backend): ejercitado por red contra la app real levantada —
`firebase emulators:start --only firestore,functions,auth`, no la suite de tests. El script
(`qa-notifications-triggers.mjs`) escribe exactamente lo que `relationshipService.js` escribe
(`followProfile`, `acceptFollowRequest`), autenticado como cada usuario vía
`@firebase/rules-unit-testing`, y espera a que el trigger real (`functions/notifications.js`,
cargado por el emulador de Functions) escriba la notificación.

**Con UI (badge, `/notifications`)**: no se click-testeó en vivo. `frontend/src/config/firebase.js`
no tiene wiring de emuladores (`connectFirestoreEmulator`/`connectAuthEmulator`) — el mismo bloqueo
que impidió el click-testing de S7 (ver `.agents/notes/qa-pendiente-main.md`), deuda de proceso
fuera de alcance de este issue. Cubierto en su lugar por: revisión de código independiente
(comentario del PR) y por los 8 casos de `firestore.rules.test.mjs` que ejercitan lectura/escritura
de notificaciones contra el emulador de reglas.

## Hallazgo durante la ejecución (y su arreglo)

La primera pasada del script **falló los 6 criterios de trigger**: `functions/notifications.js`
lanzaba `TypeError: Cannot read properties of undefined (reading 'serverTimestamp')` en cuanto
cualquier trigger se disparaba de verdad — nunca se había ejecutado contra un emulador antes.
Descartada la hipótesis de versión de Node (reproducido igual en Node 24, el que declara
`functions/package.json`, y en Node 26): el proxy de `firebase-admin` del emulador de Functions
pierde el estático `.FieldValue` del namespace de compatibilidad. Arreglado usando la API modular
(`firebase-admin/firestore`) — commit `ff0b818` en esta misma rama. Reejecutado: **7/7**.

`functions/activity.js` (S5) tiene el mismo patrón y el mismo fallo latente, nunca disparado en
producción tampoco (`qa-pendiente-main.md`). Fuera de alcance de este issue: **#5**.

## Criterios → resultado → evidencia

| Criterio | Resultado | Evidencia |
|---|---|---|
| `follow_request` al pedir seguir un perfil `invite_only` | ✅ | `qa-run-output.txt` — "bob receives a follow_request notification from dave" |
| `request_accepted` en la aceptación | ✅ | `qa-run-output.txt` — "dave receives a request_accepted notification from bob" |
| `new_follower` (directo y vía aceptación), sin duplicar con `request_accepted` | ✅ | `qa-run-output.txt` — "bob also receives a new_follower..." / "alice receives a new_follower..." / "heidi does NOT receive a request_accepted..." |
| `readAt` se puede marcar por el propio dueño; nadie más puede | ✅ | `qa-run-output.txt` — "bob marks his own... read" / "dave cannot mark bob notification read" |
| Rules: lectura/escritura owner-only, `create`/`delete` denegados al cliente | ✅ | `tests/firestore.rules.test.mjs` sección "Notifications (S8)", 8/8 vía `cd tests && npm test` → 106/106 |
| Badge en `UserMenu` / listado en `/notifications` / marcar leído al abrir | Implementado, no click-testeado en vivo (bloqueo de infra compartido con S7) | Revisión de código independiente (comentario del PR); componentes puros, prop-driven |
| Tests técnicos verdes | ✅ | `cd tests && npm run test:unit` → 151/151; `cd functions && npm run lint` → limpio |

## Ficheros

- `qa-notifications-triggers.mjs` — script de QA (ejecuta contra el emulador real).
- `qa-run-output.txt` — salida cruda de la pasada final (post-fix), 7/7.
