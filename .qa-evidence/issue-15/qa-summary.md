# QA funcional — issue #15 / PR #19

**Vehículo**: sin UI (criterios sin superficie visual). Criterio 1, petición HTTP real contra el
emulador de `functions` levantado (`auth`+`firestore`+`functions`, host/puerto documentados en
`firebase.json`), con un usuario de prueba creado en el propio emulador de Auth — nunca contra
producción. Criterio 2, documental: verificado leyendo `.agents/rules/global.md`.

| # | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | `searchGames` devuelve resultados reales para "Hades" en el emulador de `functions` local | ✅ | [criterio-01-searchgames-hades-emulador.txt](criterio-01-searchgames-hades-emulador.txt) |
| 2 | Documentado en las rules dónde se gestiona/renueva la clave RAWG | ✅ | [criterio-02-rules-rawg.txt](criterio-02-rules-rawg.txt) |

## Detalle

- **Criterio 1**: `GET http://127.0.0.1:5001/gengemztest-9582e/us-central1/searchGames?search=Hades`
  con `Authorization: Bearer <ID token de un usuario creado vía la API REST del emulador de Auth>`
  → `HTTP 200`, `count: 2803`, primer resultado `"name":"Hades"` con datos reales de RAWG (rating,
  plataformas, tags). Confirma que `functions/.secret.local` está sincronizado con la clave vigente
  de Firebase Secret Manager y que el emulador de `functions` la usa correctamente.
- **Criterio 2**: `.agents/rules/global.md` (líneas 103-109) documenta que la clave vive en Firebase
  Secret Manager del proyecto `gengemztest-9582e`, los comandos de gestión
  (`firebase functions:secrets:get/access/set RAWG_API_KEY`) y que `functions/.secret.local` es una
  copia local que puede divergir sin avisar — cumple lo pedido por el criterio.

## Nota de entorno

Igual que en el QA del #9: el frontend no está conectado a los emuladores en local (sigue sin
`connectFirestoreEmulator`/`connectAuthEmulator` en `frontend/src/config/firebase.js`), gap ya
conocido y anotado (no bloqueante, no relacionado con este issue). El QA de este issue no depende
del frontend — se ejercitó la Cloud Function directamente contra el emulador de `functions`.

Sin escritura de datos: esta tarea no toca Firestore más allá de la autenticación del usuario de
prueba (creado y descartado en el propio emulador), así que no aplica fixture/snapshot.
