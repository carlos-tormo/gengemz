# gengemz — rules del proyecto

> **Fuente canónica.** Este fichero se edita **solo aquí** (`.agents/rules/global.md`).
> `AGENTS.md` y `CLAUDE.md` de la raíz son symlinks a él: editar el symlink es editar esto.

## Qué es

Tracker de actividad de videojuegos con features sociales (perfiles, progresión, eventos de
actividad), con recorrido previsto hacia colección/tracking y marketplace.

## Stack y entorno

- **Frontend**: React 19 + Vite 7 + Tailwind + react-router 7 — `frontend/`.
- **Backend**: Cloud Functions for Firebase (Node 24, JS) — `functions/`.
- **Datos**: Firestore. Reglas en `firestore.rules`, índices en `firestore.indexes.json`.
- **Proyecto Firebase**: `gengemztest-9582e` (`.firebaserc`).

Comandos que valen como gate (ejecutar, no suponer):

```bash
cd frontend && npm run dev            # web en http://localhost:5173
cd frontend && npm run lint           # eslint del front
cd frontend && npm run build          # build de producción a frontend/dist
cd functions && npm run lint          # eslint de las functions
cd tests && npm run test:unit         # unit + fake firestore, sin emulador
cd tests && npm test                  # reglas de Firestore contra el emulador
firebase emulators:start              # auth 9099 · firestore 8080 · functions 5001 · hosting 5002
```

## Método de trabajo — agent-flow

Este proyecto trabaja con **agent-flow** (`~/projects/agent-flow`). Antes de escribir código:

1. **Lee `~/projects/agent-flow/rules/engineering-discipline.md`** — es el método, no la arquitectura:
   entender antes de escribir, leer por rango, cambio mínimo, verificar contra la realidad, la salida
   de un gate son candidatos, lo aprendido vuelve a las rules.
2. **Las cinco fases se ejecutan todas**, en orden, con las skills de agent-flow:

   ```
   /spec → (/refine) → /implement → /review → /qa-funcional → /deploy
   ```

   `/refine` lo invoca `/implement` como paso 0 cuando el issue no lleva refinamiento o ha caducado.
   `/review` **no se salta** y no te revisas a ti mismo.
3. **El handoff entre fases va por disco**, en `.agents/tasks/issue-<N>/handoff.md` (gitignored), no
   por el chat. `/deploy` borra ese directorio al mergear.
4. **`Done` = mergeado a `main`**, no desplegado. Aquí el despliegue **no** es automático
   post-merge (`firebase deploy` a mano), así que `/deploy` termina en el merge y anota el desfase
   main↔producción en `.agents/notes/qa-pendiente-main.md`.

Si una skill de agent-flow y estas rules discrepan, mandan estas rules — pero el desacuerdo se dice,
no se reinterpreta en silencio.

## Mantenimiento del contexto

- **Al empezar sesión**: leer `.agents/notes/INDEX.md` y abrir **solo** las notes cuyo disparador
  coincida con la tarea. No leer todas las notes.
- **Al cerrar una unidad de trabajo**: volcar a una note el estado — hecho, pendiente, decisiones y
  su porqué, siguiente paso. El contexto vive en ficheros, no en el historial de conversación.
- **Lo aprendido vuelve a la rule o a la note en la misma sesión.** ¿Lo necesitaría alguien que
  llegue nuevo? Rule. ¿Solo sirve para retomar este trabajo? Note.

## Flujo de trabajo (GitHub)

- **Repo**: `carlos-tormo/gengemz` · **Tablero**: ⚠️ **pendiente de crear** — hasta que exista, las
  skills de proceso no tienen dónde poner el estado. Ejecutar `/new-project` para crearlo y
  sustituir esta línea por `[Project <n> de carlos-tormo](<url>)`. Las tareas son **issues** de este repo.

### El estado vive en el tablero; los labels dicen el tipo

Seis estados, en el campo `Status` del Project y **en ningún otro sitio**:

```
Backlog → In Progress → Code Review → QA → Ready for prod → Done
```

- **No hay labels de estado.** Duplicarlo en label y columna obliga a sincronizar a mano.
- **Un issue que no está en el tablero no tiene estado**: `/spec` lo añade al crearlo.
- `Ready for prod` es el único estado donde la tarea espera a algo ajeno a ti (aquí, un
  `firebase deploy` manual).

**Labels = tipo de tarea**: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, y `skip-qa` para lo
que no tiene superficie funcional. Uno por issue, no cambia durante el ciclo. **`Priority`** (P0–P3)
es otro campo del tablero.

### Lo que las skills preguntan si no está escrito aquí

- **Estrategia de merge**: **commit de merge**, una rama y un PR por issue. Motivo: con merge commit
  los commits de implementación y los de arreglo del review quedan identificables en el historial —
  «qué cambió el review» sigue siendo respondible meses después, y con squash no. Rompe con el
  historial previo, que era de commits directos a `main` sin PRs: desde ahora `/implement` abre rama
  y `/review` pasa sobre el PR.
- **Commit de evidencias de QA**: `.qa-evidence/` **va en el `.gitignore`**, así que el commit de
  evidencias de `/qa-funcional` necesita **`git add -f`**, y `/deploy` lo revierte antes de mergear.
  Motivo: `main` es lo que construye Firebase Hosting; capturas y logs del emulador no viven ahí.
- **Dónde corre la app en local**: web en `http://localhost:5173` (`npm run dev` en `frontend/`).
  El 5173 puede estar ocupado por otro dev server de la máquina: Vite sube al 5174 sin avisar más que
  en su propia salida — leer el puerto que imprime en vez de suponerlo.
  No hay API HTTP propia: la superficie es Firestore + Cloud Functions, y `/qa-funcional` ejercita
  los criterios contra los emuladores (firestore `8080`, functions `5001`, auth `9099`, hosting `5002`).
- **Cómo se despliega**: `cd frontend && npm run build && firebase deploy` desde la raíz. No hay
  pipeline; **no hay CI** que ejecute los gates en push/PR (deuda conocida).
- **Dónde se anota el desfase main↔producción**: `.agents/notes/qa-pendiente-main.md`.
