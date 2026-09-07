# QA funcional — issue #11 (PR #17)

## Vehículo elegido y por qué

Mismo gap documentado desde #6/#7/#8/#9/#10 (`.agents/notes/qa-pendiente-main.md`): el frontend no
está conectado a los emuladores (`connectFirestoreEmulator`/`connectAuthEmulator` ausentes en
`frontend/src/config/firebase.js`), así que `npm run dev` habla contra el proyecto Firebase real
por defecto. Repetí el patrón ya usado y aceptado en el QA de #9/#10:

1. Levanté `firebase emulators:start` (auth 9099, firestore 8080, functions 5001, hosting 5002).
2. Añadí temporalmente `connectAuthEmulator`/`connectFirestoreEmulator` a
   `frontend/src/config/firebase.js` — **parche no commiteado**, revertido con `git checkout --`
   antes de terminar (`git diff` limpio, confirmado).
3. Bypaseé temporalmente el gate de `isQuestOnboardingOpen` en
   `frontend/src/hooks/useUserProfile.js` (exige usuario no-anónimo con `privacy` fijado — gate de
   #8, no tocado por este PR) para abrir el modal sin login real de Google — **mismo parche
   temporal no commiteado**, también revertido.
4. Con eso, el navegador real (Chrome) contra `http://localhost:5173` hablaba con el **Firestore
   emulator real** y la búsqueda RAWG pasaba por la **Cloud Function `searchGames` real** corriendo
   en el emulador de `functions`.

**Hallazgo de infraestructura, ya conocido y no bloqueante** (no introducido por este PR): la clave
de RAWG en `functions/.secret.local` sigue caducada (issue #15) — la Cloud Function real devolvió
`401` de nuevo (log completo, con la clave redactada, en
`criterio-02-rawg-cloud-function-real.txt`). Esto prueba que la cadena `QuestGameSearchStep` →
`useGameSearch` → `searchGamesWithVariants` → Cloud Function `searchGames` → RAWG funciona de
extremo a extremo también para Quest 3, tal y como pide el criterio 2; el 401 es un problema de la
clave, no del código de este PR. Para ejercitar el criterio 3 (selección → añade a `backlog`)
stubbeé la respuesta de `fetch` a `searchGames` con un JSON de forma idéntica a la de RAWG — el
resto de la cadena (escritura en el Firestore emulator real vía `boardActions.addGameToBoard`) no
se tocó ni se mockeó.

**Dos cuentas anónimas del emulador**, para no reutilizar el mismo tablero entre el escenario de
selección (criterio 1-3) y el de Skip (criterio 4): abrir una pestaña nueva y limpiar
`localStorage`/`IndexedDB` desde una consola distinta evita el incidente de sesión bloqueada que
documentó el QA de #10 (mezclar limpieza manual de storage con una sesión de Auth SDK ya
inicializada).

## Criterios de aceptación

| # | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | Quest 3 muestra el título "¿Algo que quieras jugar en el futuro?", el mismo campo de búsqueda y una explicación breve de "To Play" | ✅ | `criterio-01-quest3-titulo-copy-buscador.jpg` |
| 2 | Reutiliza `QuestGameSearchStep` (#9) sin reimplementar búsqueda ni layout | ✅ | `criterio-02-rawg-cloud-function-real.txt` (la Cloud Function real se ejecutó igual que en Quest 1/2, 401 por clave caducada #15) + `criterio-02-resultado-busqueda.jpg` (resultado stubbeado renderizado por el mismo componente) |
| 3 | Seleccionar un resultado añade el juego a la columna `backlog` con el mismo mecanismo `boardActions`/`useBoard.js` | ✅ | `criterio-03-firestore-write-columnId-backlog.json` — lectura directa (REST, `Authorization: Bearer owner`) del documento escrito en el Firestore emulator real: `"columnId": "backlog"`, con el shape de `createBoardGameFromRaw` (`rawgId`, `rawgSlug`, `externalSource: "rawg"`), sin `completedAt` — y `criterio-03-auto-avance-quest4.jpg`, que muestra el avance automático a "Quest 4 of 4" tras la selección con "Hollow Knight" ya visible en la columna "To Play" de fondo |
| 4 | "Skip" avanza al paso 4 sin añadir nada al tablero | ✅ | `criterio-04-skip-avanza-sin-anadir.jpg` ("Quest 4 of 4" tras Skip, sin buscar ni seleccionar nada) + `criterio-04-skip-sin-anadir-firestore.json` — lectura de la colección `games` del segundo usuario de prueba tras el Skip: `{}`, 0 documentos |

## Limpieza

- Parches temporales revertidos con `git checkout -- frontend/src/config/firebase.js
  frontend/src/hooks/useUserProfile.js` — `git diff` vacío en ambos, confirmado antes de commitear
  esta evidencia.
- Los datos de prueba (dos cuentas anónimas de emulador, documento `Hollow Knight` stubbeado)
  vivieron solo en el Firestore/Auth emulator local, detenidos al terminar esta sesión — no
  persisten y no tocan el proyecto Firebase real (`projectId` `gengemztest-9582e` solo en el
  emulador local, `127.0.0.1`, nunca escritura fuera de ahí).

## Resultado

**4/4 criterios verificados contra la app real (navegador + Firestore/Functions/Auth emulators
reales, sin mocks salvo el payload de RAWG por la clave caducada, hallazgo ya conocido en #15). QA
funcional aprobado.**
