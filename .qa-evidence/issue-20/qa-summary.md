# QA funcional — issue #20 (PR #21)

Ejecutado el 2026-09-08 contra la app real: `firebase emulators:start --only functions`
(`searchGames` con la clave RAWG real vía `functions/.secret.local`) + `cd frontend && npm run
dev` (Vite en `http://localhost:5173`). Se forzó temporalmente `isOpen={true}` en
`<QuestOnboarding>` (`App.jsx:1072`), como documenta la reproducción del issue, para abrir el
modal sin depender del gating de privacidad — revertido antes de terminar (`git status` limpio).
Automatizado con Playwright headless (Chromium) vía script Node, `npm root -g`/playwright.

## Reproducción del bug original

Antes del fix (verificado en `/review` y en `/implement`, no repetido aquí): tras añadir un juego
en Quest 1, Quest 2 heredaba el campo de búsqueda y los resultados del quest anterior, con todos
los botones "Add" deshabilitados. El script de este QA ejercita exactamente esa transición
(Quest 1→2 con "Hades") y confirma que ya no ocurre.

## Criterios de aceptación

| # | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | Al avanzar de un quest de búsqueda a otro (1→2, 2→3), el campo y los resultados del quest anterior no aparecen — arranca vacío | ✅ | [criterio-01-quest1-inicial.png](criterio-01-quest1-inicial.png), [criterio-01-quest1-resultados-hades.png](criterio-01-quest1-resultados-hades.png), [criterio-01-quest2-arranca-vacio.png](criterio-01-quest2-arranca-vacio.png) |
| 2 | El botón "Add" del nuevo quest está habilitado y, al pulsarlo, añade el juego y avanza — sin recargar ni reabrir el modal | ✅ | [criterio-02-quest2-add-habilitado.png](criterio-02-quest2-add-habilitado.png) |
| 3 | Verificado en los tres quests de búsqueda (1→2 y 2→3), no solo el primer salto | ✅ | [criterio-03-quest3-arranca-vacio.png](criterio-03-quest3-arranca-vacio.png), [criterio-03-quest3-add-habilitado.png](criterio-03-quest3-add-habilitado.png), [criterio-03-avanza-a-quest4.png](criterio-03-avanza-a-quest4.png) |
| 4 | No regresiona: el botón "Add" sigue deshabilitado tras elegir un juego dentro del **mismo** quest (evita doble-click mientras `onSelect()` no ha desmontado el paso) | ✅ | [criterio-04-no-doble-avance-tras-doble-click.png](criterio-04-no-doble-avance-tras-doble-click.png) |

### Detalle criterio 4

Se buscó "Portal 2" en Quest 1 y se lanzaron dos clicks reales sin esperar entre ellos: uno sobre
el primer resultado, otro sobre el segundo. El segundo click expiró con
`locator.click: Timeout 1500ms exceeded` — Playwright no pudo completarlo porque el botón ya no
era interactuable (deshabilitado o desmontado tras el primer click), confirmando que el guard
sigue activo. Verificación adicional: tras el intento, la app aterrizó exactamente en Quest 2 (no
saltó a Quest 3), es decir, no hubo doble-avance ni doble-alta del juego.

## Script

Guardado como referencia (no versionado, ejecutado desde `/tmp/qa20/qa-issue-20.mjs` en esta
sesión): busca en RAWG, añade el primer resultado en cada quest de búsqueda y comprueba el estado
del siguiente antes/después de cada transición.

## Resultado

**4/4 criterios verificados, sin fallos.** El bug reproducido en el issue no se reproduce con el
fix aplicado.
