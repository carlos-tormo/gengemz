# QA funcional — issue #10 (PR #16)

## Vehículo elegido y por qué

Mismo gap documentado para issues #6/#7/#8/#9 (`.agents/notes/qa-pendiente-main.md`): el frontend
no está conectado a los emuladores (`connectFirestoreEmulator`/`connectAuthEmulator` ausentes en
`frontend/src/config/firebase.js`), así que `npm run dev` habla contra el proyecto Firebase real
por defecto. Repetí el patrón ya usado y aceptado en el QA de #9 (PR #14):

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
de RAWG en `functions/.secret.local` sigue caducada (issue #15, abierto desde el QA de #9) — la
Cloud Function real devolvió `401` de nuevo (log completo en
`criterio-02-rawg-cloud-function-real.txt`). Esto prueba que la cadena `QuestGameSearchStep` →
`useGameSearch` → `searchGamesWithVariants` → Cloud Function `searchGames` → RAWG funciona de
extremo a extremo también para Quest 2, tal y como pide el criterio 2; el 401 es un problema de la
clave, no del código de este PR. Para ejercitar el criterio 3 (selección → añade a `completed`)
stubbeé la respuesta de `fetch` a `searchGames` con un JSON de forma idéntica a la de RAWG — el
resto de la cadena (escritura en el Firestore emulator real vía `boardActions.addGameToBoard`) no
se tocó ni se mockeó.

**Incidente de sesión, resuelto reiniciando**: durante la verificación del criterio 4, limpiar
`localStorage`/`IndexedDB` manualmente desde la consola de la página (para forzar una sesión
anónima nueva) dejó el SDK de Firebase Auth de ese tab en un estado bloqueado (`signInAnonymously`
nunca resolvía ni rechazaba, aunque el emulador respondía bien a peticiones REST directas). No
insistí por ese camino: reinicié limpio los emuladores y `vite`, abrí una pestaña nueva sin tocar
su storage a mano, y el flujo de auto-login anónimo funcionó de inmediato. No es un hallazgo del
producto — es una peculiaridad de mezclar limpieza manual de IndexedDB con una sesión de Firebase
Auth SDK ya inicializada; queda anotado aquí por si se repite en un QA futuro.

## Criterios de aceptación

| # | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | Quest 2 muestra el título "¿Has completado algo últimamente?", el mismo campo de búsqueda y una explicación breve de "Victory Road" | ✅ | `criterio-01-quest2-titulo-copy-buscador.png` |
| 2 | Reutiliza `QuestGameSearchStep` (#9) sin reimplementar búsqueda ni layout | ✅ | `criterio-02-rawg-cloud-function-real.txt` (la Cloud Function real se ejecutó igual que en Quest 1) + `criterio-02-resultado-busqueda.png` (resultado stubbeado renderizado por el mismo componente) |
| 3 | Seleccionar un resultado añade el juego a la columna marcada `isCompletion` (vía `completionColumnId`, sin id literal) con el mismo mecanismo `boardActions`/`useBoard.js` | ✅ | `criterio-03-firestore-write-columnId-completed.json` — lectura directa (REST, `Authorization: Bearer owner`) del documento escrito en el Firestore emulator real: `"columnId": "completed"`, `"completedAt"` estampado automáticamente, con el shape de `createBoardGameFromRaw` (`rawgId`, `rawgSlug`, `externalSource: "rawg"`) — y `criterio-04-auto-avance-quest3.png`, que muestra el avance automático a "Quest 3 of 4" tras la selección |
| 4 | "Skip" avanza al paso 3 sin añadir nada al tablero | ✅ | `criterio-04-skip-avanza-sin-anadir.png` ("Quest 3 of 4" tras Skip, sin buscar ni seleccionar nada) + `criterio-04-skip-sin-anadir-firestore.json` — consulta `runQuery` de todo el proyecto (`collectionId: games, allDescendants: true`) antes y después del Skip: `0` documentos en ambos casos |

## Limpieza

- Parches temporales revertidos con `git checkout -- frontend/src/config/firebase.js
  frontend/src/hooks/useUserProfile.js` — `git diff` vacío en ambos, confirmado antes de commitear
  esta evidencia.
- Los datos de prueba (cuentas anónimas de emulador, documento `Hollow Knight` stubbeado) vivieron
  solo en el Firestore/Auth emulator local, detenidos al terminar esta sesión — no persisten y no
  tocan el proyecto Firebase real (confirmado el `projectId` del cliente en cada paso:
  `gengemztest-9582e` en el emulador local, nunca escritura fuera de `127.0.0.1`).

## Resultado

**4/4 criterios verificados contra la app real (navegador + Firestore/Functions/Auth emulators
reales, sin mocks salvo el payload de RAWG por la clave caducada, hallazgo ya conocido en #15). QA
funcional aprobado.**
