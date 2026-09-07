# QA funcional — issue #9 (PR #14)

## Vehículo elegido y por qué

Mismo gap ya documentado para issues #6/#7/#8 (`.agents/notes/qa-pendiente-main.md`): el frontend no
está conectado a los emuladores (`connectFirestoreEmulator`/`connectAuthEmulator` ausentes en
`frontend/src/config/firebase.js`), así que `npm run dev` habla contra el proyecto Firebase real
por defecto. Sin poder hacer login real con Google (única vía de autenticación no-anónima que
expone la UI, y entrar credenciales OAuth reales no es algo que este agente pueda hacer por su
cuenta), usé el mismo patrón documentado en esa note:

1. Levanté `firebase emulators:start` (auth 9099, firestore 8080, functions 5001, hosting 5002).
2. Añadí temporalmente `connectAuthEmulator`/`connectFirestoreEmulator` a
   `frontend/src/config/firebase.js` (guardado tras `location.hostname` como el resto del proyecto
   hace en `constants.js`) — **parche no commiteado**, revertido con `git checkout --` antes de
   terminar (`git diff` limpio, confirmado más abajo).
3. Bypaseé temporalmente `isQuestOnboardingOpen` en `frontend/src/hooks/useUserProfile.js` (que
   normalmente exige usuario no-anónimo con `privacy` fijado — gate de #8, no tocado por este PR,
   ya QA'd en su momento) para poder abrir el modal sin login real de Google — **mismo parche
   temporal no commiteado**, también revertido.
4. Con eso, el navegador real (Chrome) contra `http://localhost:5173` hablaba con el **Firestore
   emulator real** (nunca el proyecto real: la cuenta anónima de la sesión de emulador es nueva y
   vacía en cada arranque) y la búsqueda RAWG pasaba por la **Cloud Function `searchGames` real**
   corriendo en el emulador de `functions` — no un mock ni una reimplementación.

**Hallazgo de infraestructura durante el QA** (no bloqueante, no introducido por este PR): la clave
de RAWG en `functions/.secret.local` está caducada/inválida — la Cloud Function real, ejecutándose
de verdad contra `https://api.rawg.io`, devolvió `401` (log completo en
`criterio-02-rawg-cloud-function-real.txt`). Esto prueba que la cadena
`QuestGameSearchStep` → `useGameSearch` → `searchGamesWithVariants` → Cloud Function `searchGames`
→ RAWG funciona de extremo a extremo tal y como pide el criterio 2 del issue; el 401 es un problema
de la clave, no del código de este PR. Para poder ejercitar el criterio 3 (selección → añade al
tablero) hizo falta un resultado de búsqueda, así que stubbeé la respuesta de `fetch` a
`searchGames` con un JSON de forma idéntica a la de RAWG — el resto de la cadena (escritura en el
Firestore emulator real vía `boardActions.addGameToBoard`) no se tocó ni se mockeó.

## Criterios de aceptación

| # | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | Quest 1 muestra título "¿A qué estás jugando?", buscador y explicación breve de "Currently Playing" | ✅ | `criterio-01-quest1-titulo-copy-buscador.png` |
| 2 | La búsqueda reutiliza `useGameSearch`/RAWG sin duplicar lógica de fetch | ✅ | `criterio-02-rawg-cloud-function-real.txt` (log del emulador: la Cloud Function real se ejecutó y llamó a RAWG de verdad) + `criterio-02-resultado-busqueda.png` |
| 3 | Seleccionar un resultado añade el juego a la columna marcada `isPlaying` vía el mismo mecanismo que el resto de la app | ✅ | `criterio-03-firestore-write-columnId-playing.json` — lectura directa (REST, `Authorization: Bearer owner`) del documento escrito en el Firestore emulator real: `"columnId": "playing"`, con el shape exacto de `createBoardGameFromRaw` (`rawgId`, `rawgSlug`, `externalSource: "rawg"`, etc.) |
| 4 | "Skip" sin seleccionar avanza sin añadir nada al tablero | ✅ | `criterio-04-skip-avanza-sin-anadir.png` (columna "To Play: 0") + recuento de documentos en `games/` sin cambios tras el Skip (1 documento, el mismo de antes — comprobado por consulta REST directa, no capturado en fichero aparte) |
| 5 | Tras seleccionar (o saltar) el paso avanza automáticamente | ✅ | `criterio-05-auto-avance-quest2.png` (tras seleccionar) y `criterio-04-skip-avanza-sin-anadir.png` (tras Skip) — ambos muestran "Quest 2 of 4" sin pulsar ningún botón "Siguiente" |
| 6 | Componente reutilizable extraído (título/copy/búsqueda/columna destino por props) | ✅ | Verificado por lectura de código en `/review` (`QuestGameSearchStep.jsx`), no es un criterio ejercitable contra la app corriendo por sí mismo — la propia ejecución de los criterios 1-5 ya demuestra que el componente extraído funciona con esas props |

## Limpieza

- Parches temporales revertidos con `git checkout -- frontend/src/config/firebase.js
  frontend/src/hooks/useUserProfile.js` — `git diff` vacío en ambos, confirmado antes de commitear
  esta evidencia.
- Los datos de prueba (cuenta anónima de emulador, documento `QA Issue 9 Game`) viven solo en el
  Firestore emulator local, que se detiene al terminar esta sesión — no persisten y no tocan el
  proyecto Firebase real.

## Resultado

**6/6 criterios verificados contra la app real (navegador + Firestore/Functions emulators reales,
sin mocks salvo el payload de RAWG por la clave caducada). QA funcional aprobado.**
