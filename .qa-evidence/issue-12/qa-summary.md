# QA funcional — issue #12 (PR #18)

## Vehículo elegido y por qué

Mismo gap ya documentado desde #6/#7/#8/#9/#10/#11 (`.agents/notes/qa-pendiente-main.md`): el
frontend no está conectado a los emuladores (`connectFirestoreEmulator`/`connectAuthEmulator`
ausentes en `frontend/src/config/firebase.js`), así que `npm run dev` habla contra el proyecto
Firebase real por defecto. Reutilicé el mismo patrón ya usado y aceptado en el QA de #9/#10/#11:

1. Levanté `firebase emulators:start` (auth 9099, firestore 8080, functions 5001, hosting 5002).
2. Añadí temporalmente `connectAuthEmulator`/`connectFirestoreEmulator` a
   `frontend/src/config/firebase.js` — **parche no commiteado**, revertido con `git checkout --`
   antes de terminar (`git diff` limpio, confirmado más abajo).
3. Bypaseé temporalmente `isQuestOnboardingOpen` en `frontend/src/hooks/useUserProfile.js` (que
   normalmente exige usuario no-anónimo con `privacy` fijado — gate de #8, no tocado por este PR)
   quitando solo `!user.isAnonymous`, para poder abrir el onboarding sin login real de Google —
   **mismo parche temporal no commiteado**, también revertido.
4. Con el gate de anónimos fuera, `userSettings.privacy` seguía haciendo falta: como el modal
   "Welcome" que normalmente lo fija también exige usuario no-anónimo, escribí `privacy` **por REST
   directo al Firestore emulator** (`Authorization: Bearer owner`, que impersona admin y bypassa
   `firestore.rules`) sobre el doc de `settings` de cada cuenta anónima de prueba, en vez de tocar
   ese segundo gate (evita tocar más superficie de la necesaria).
5. Usé **tres cuentas anónimas distintas del emulador** (`localStorage.clear()` +
   `indexedDB.deleteDatabase` + recarga entre cada una) para no mezclar los tres escenarios
   (crear columna, Skip/Finish sin crear, cancelar el modal).

**Hallazgo de vehículo, no del código de este PR**: con una cuenta anónima sin ningún juego en el
tablero, `App.jsx:784` (`showLanding`) mantiene la landing page ("Track Your Gaming Journey") en
vez del tablero, aunque la columna ya se haya creado en Firestore — es la misma heurística que ya
existía antes de este PR y que solo afecta a cuentas anónimas vacías (nunca a una cuenta real no-
anónima, que es el único tipo de cuenta que llega a Quest 4 en producción). Para verificar el
criterio 4 sin ese ruido, escribí un documento de juego de prueba directo por REST en la cuenta A
(`games/qa-issue-12-dummy`) y recargué: con `data.games` no vacío, `showLanding` se desactiva y el
tablero se ve con la columna nueva (`criterio-04-tablero-con-columna-nueva.jpg`).

## Criterios de aceptación

| # | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | Quest 4 explica en un par de frases que se pueden crear columnas propias, con ≥2 ejemplos concretos ("Jugando en co-op", "Platinados") | ✅ | `criterio-01-quest4-copy-ejemplos.jpg` |
| 2 | El paso abre directamente el modal existente de creación de columna (`openAddColumnModal`/"Create New List") sin reimplementarlo | ✅ | `criterio-02-modal-existente-sin-reimplementar.jpg` — mismo modal "Create New List" con título/icono/toggles `isCompletion`/`isPlaying` de siempre, apilado sobre el onboarding + `criterio-02-firestore-write-columna-mismo-shape.txt` — la columna creada desde el quest llega a Firestore con el mismo shape (`id`/`title`/`icon`) que las columnas por defecto, escrita por el mismo `boardActions.saveColumn` |
| 3 | Crear una columna desde aquí, o pulsar "Skip"/"Finalizar", cierra el onboarding y escribe `settings.questOnboardingCompleted` | ✅ (ambos caminos) | **Crear columna** (cuenta A): `criterio-03a-firestore-flag-tras-crear-columna.txt` (`questOnboardingCompleted: true`, `updateTime` 18:25:03) — mismo segundo que la escritura de la columna en `criterio-02-firestore-write-columna-mismo-shape.txt`. **Skip/Finish sin crear** (cuenta B): `criterio-03b-quest4-antes-de-finish.jpg` → `criterio-03b-onboarding-cerrado-tras-finish.jpg` (landing tras cerrar) + `criterio-03b-firestore-flag-y-sin-columna-tras-finish.txt` (`questOnboardingCompleted: true`, y el doc `board` da `404 NOT_FOUND` — ninguna columna se creó) |
| 4 | Tras cerrar el onboarding desde este paso, el usuario aterriza en el tablero normal con la columna nueva (si la creó) visible | ✅ | `criterio-04-tablero-con-columna-nueva.jpg` — tablero con las 3 columnas de siempre + "Jugando en co-op" visible, sin ningún modal abierto |

**Caso borde verificado además de los 4 criterios** (no es un criterio del issue, pero es el
mecanismo que hace que el criterio 3 no se dispare por error): cancelar el modal de creación de
columna con la X, en vez de guardar, **no** cierra el onboarding ni escribe el flag — vuelve a
mostrar Quest 4 tal cual. `caso-borde-cancelar-no-completa-onboarding.jpg` +
`caso-borde-cancelar-firestore-flag-sigue-false.txt` (`questOnboardingCompleted: false` tras
cancelar, cuenta C).

## Limpieza

- Parches temporales revertidos con `git checkout -- frontend/src/config/firebase.js
  frontend/src/hooks/useUserProfile.js` — `git diff` vacío en ambos, confirmado antes de commitear
  esta evidencia.
- Las tres cuentas anónimas de prueba (A/B/C) y sus documentos viven solo en el Firestore/Auth
  emulator local, detenido al terminar esta sesión — no persisten y no tocan el proyecto Firebase
  real (`gengemztest-9582e` solo en el emulador local, `127.0.0.1`, nunca escritura fuera de ahí).

## Resultado

**4/4 criterios de aceptación verificados contra la app real (navegador real + Firestore/Auth
emulators reales, sin mocks). QA funcional aprobado.**
