# QA funcional — issue #6 / PR #7

HEAD verificado: `bbad9b1` (rama `6-gate-social-writes-to-non-anonymous-accounts`).

## Entorno de la prueba

- **No se usó el proyecto Firebase real (`gengemztest-9582e`).** `frontend/src/config/firebase.js`
  no tiene wiring de emuladores en la rama (gap ya conocido, ver
  `.agents/notes/qa-pendiente-main.md`, sección S7). Para no tocar datos de producción se aplicó un
  **parche temporal, no commiteado**, solo para esta sesión de QA:
  - `frontend/src/config/firebase.js`: conecta a los emuladores (`connectAuthEmulator`,
    `connectFirestoreEmulator`) solo si `VITE_USE_EMULATORS=true`.
  - `frontend/vite.config.js`: permite el host `host.docker.internal` solo si
    `QA_ALLOW_DOCKER_HOST=true` (Vite bloquea por defecto cabeceras `Host` no reconocidas; el
    contenedor de Playwright llega por ahí, no por `localhost`, porque `--network host` de Docker
    Desktop en macOS no comparte de verdad la red del Mac).
  - `firebase.json`: los emuladores `auth`/`firestore` se arrancaron con `"host": "0.0.0.0"` para
    que el contenedor pudiera alcanzarlos vía `host.docker.internal`.
  - Los tres cambios se revierten antes del commit de evidencias (`git diff` limpio en esos
    ficheros al comitear). No forman parte del PR.
- Emuladores: `firebase emulators:start --only auth,firestore,functions,hosting` (auth 9099,
  firestore 8080, functions 5001, hosting 5002).
- App: `cd frontend && npm run dev` con `VITE_USE_EMULATORS=true VITE_EMULATOR_HOST=host.docker.internal
  QA_ALLOW_DOCKER_HOST=true` → sirvió en `http://localhost:5174` (el 5173 estaba ocupado por otro
  proceso de la máquina).
- Playwright: no está instalado ni en global ni en ningún `node_modules` del proyecto
  (`$(npm root -g)/playwright` no existe). Se usó el contenedor efímero de la imagen oficial
  `mcr.microsoft.com/playwright:v1.55.0-noble` con `playwright@1.55.0` instalado dentro, siguiendo
  el patrón documentado para esta situación. El contenedor llega al dev server y a los emuladores
  vía `host.docker.internal` (con `--add-host=host.docker.internal:host-gateway`).
- **Siembra de datos de prueba**: no había ningún perfil público en el emulador limpio. Se sembró
  uno directamente con `firebase-admin` (bypassa las rules, como cualquier admin SDK) contra el
  emulador de Firestore: documento `artifacts/gengemz-prod/public_profiles/qa-issue6-public-user`
  con `privacy: "public"`. Dato solo en el emulador efímero, se pierde al pararlo — no contamina
  nada persistente.
- Sesión anónima: la app crea sesión anónima sola al cargar sin usuario (`signInAnonymously` en
  `App.jsx`); no hizo falta ninguna credencial de prueba.

## Criterios de aceptación (issue #6)

| # | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | `isRealUser()` existe en `firestore.rules` | ✅ | Verificado leyendo `firestore.rules` en HEAD `bbad9b1` (línea ~8); cubierto también por la suite de rules. |
| 2 | `validFollowing`/`validFollowers`/`validRequests`/`validBlocked` exigen `isRealUser()` en el lado que escribe | ✅ | `cd tests && npm test` → **117 passed, 0 failed** en HEAD `bbad9b1` (reconfirmado en esta sesión, ver `qa-rules-rerun.txt`). |
| 3 | `validPlaylistCreate` exige `isRealUser()` cuando `privacy == "public"` | ✅ | Misma suite, sección "Playlists": `anonymous cannot create a public playlist` / `anonymous can create a private playlist` / `real user creates a public playlist`. |
| 4 | Con token anónimo, deny en seguir/pedir/aceptar/bloquear y en crear playlist pública; casos allow para usuario real | ✅ | Misma suite — 117/117, incluye los casos allow/deny descritos. |
| 5 | `validOptionalBool` borrado de `firestore.rules` | ✅ | `grep -n validOptionalBool firestore.rules` no devuelve nada en HEAD `bbad9b1`. |
| 6 | `ProfilePage.jsx`/`SearchDropdown.jsx`: botón de seguir/pedir visible para anónimos, abre login al pulsar | ✅ | Playwright headless contra la app real: `criterio-2-6-follow-visible-block-hidden.png` (botón "Follow" visible, sesión "Guest"/anónima, sin botón "Block"), `criterio-2-login-popup-google-sign-in.png` (clic en "Follow" abre un popup con la pantalla "Sign-in with Google.com" servida por el Auth Emulator — confirma que se invocó `signInWithPopup`, no una escritura en Firestore). Log de red en `console-and-network-log.txt` (peticiones a `identitytoolkit.googleapis.com`/`emulator/auth/handler` con `providerId=google.com`). |
| 7 | `cd tests && npm test` en verde | ✅ | 117 passed, 0 failed (ver `qa-rules-rerun.txt`). |

**Extra (hallazgo de `/review`, no del enunciado original de #6)**: `validPlaylistUpdate` también
exige `isRealUser()` al pasar `privacy` a `"public"` — cerraba un bypass (crear privada, luego
`update` a pública sin gate). Cubierto por los mismos 117 tests (`anonymous cannot flip a private
playlist to public via update`).

## Limitaciones de la evidencia — sé explícito sobre qué no se pudo verificar

- **No se completó un login real de Google.** El popup abierto es el emulador de Auth (pantalla
  "Sign-in with Google.com" con "No Google.com accounts exist in the Auth Emulator"), no la pantalla
  real de accounts.google.com — es la vía correcta para no depender de una cuenta Google real ni de
  interacción humana, pero significa que **no se probó el flujo con el proveedor Google real**, solo
  que `signInWithPopup` se dispara y navega a un IDP de Google (real o emulado, según el entorno).
  Completar el login (crear una cuenta ficticia en el emulador y seguir el flujo hasta
  `onAuthStateChanged`) no se hizo en esta pasada: no es necesario para el criterio del issue, que
  solo pide que el clic abra el flujo de login en vez de escribir en Firestore.
- **No se verificó `SearchDropdown.jsx` con navegador** (el criterio original del issue lo nombra,
  pero según el handoff de `/implement` no se tocó porque ya comparte `handleFollowAction` con
  `ProfilePage.jsx` vía `App.jsx`). Se verificó por lectura de código
  (`grep -n handleFollowAction frontend/src/components/SearchDropdown.jsx` usa la misma función
  centralizada), no con clic real en el dropdown de búsqueda — anotado como límite, no se inventó
  evidencia de UI que no se obtuvo.
- El gap de wiring de emuladores en `frontend/src/config/firebase.js` (que obligó al parche temporal
  de esta sesión) sigue sin resolverse en la rama: es candidato a issue propio para no repetir este
  rodeo en cada QA con UI.
