# Gengemz — Code Review & Refactoring Kickoff

*Reviewed 5 Sep 2026 against the working tree at `~/ggz/gengemz` (commit `abb8dc9` plus ~3,500 lines of uncommitted changes). Every file outside `node_modules` was read in full: ~5,000 lines across the Vite/React frontend, the Cloud Function, and the Firestore rules.*

---

## 1. Snapshot

**Stack.** React 19 + Vite 7 SPA, Tailwind (v3 via PostCSS), `lucide-react` icons, Firebase 12 (Auth with anonymous + Google, Firestore, Hosting), one Cloud Function (Node 24, `firebase-functions` v2) that proxies the RAWG games API. No router, no TypeScript, no tests, no CI.

**Shape.** ~5,000 LOC. `App.jsx` alone is 1,698 lines with 51 `useState` calls, 7 inline modals and 19 `alert`/`prompt`/`confirm` calls. The rest is reasonably layered: `services/` (Firestore + RAWG access), `hooks/` (board, playlists, relationships, profile, search), `components/` (board, browse, cards, menus), `utils/gameUtils.js` (game identity matching).

**Honest overall verdict.** This is in better shape than "vibecoded" usually implies. The pure board-mutation functions in `boardService.js`, the game-identity logic in `gameUtils.js`, and especially the Firestore rules (290 lines, with schema validation, `hasOnly` key whitelists, size caps and `request.time` checks) are well above average. The real problems are concentrated in four places: an unrotated API key in git history, a data-loss bug caused by `merge: true`, an unauthenticated and spoofable proxy function, and the god-component `App.jsx` that will block every future feature.

---

## 2. Priority summary

| # | Finding | Severity | Effort |
|---|---|---|---|
| S1 | RAWG API key committed in git history (`functions/index.js`, old commit) — rotate it | **Critical** | 15 min |
| S2 | ~3,500 lines of the current app are uncommitted / untracked — one `rm -rf` from losing the refactor | **Critical** | 10 min |
| B1 | `setDoc(..., {merge:true})` on the board never deletes games/columns → zombie data, "On board" false positives, 500-game cap fills up | **High** | 1–2 h |
| S3 | `searchGames` function: no auth/App Check, `cors: true`, rate limit is per-instance and bypassable via `X-Forwarded-For` | **High** | 2–4 h |
| S4 | Any *unauthenticated* client can read every public/invite-only user's full board; "invite only" gates nothing | **High** | 1 h |
| B2 | Hard-coded column ids (`backlog`/`playing`/`completed`) in `GameCard` and `App.jsx` → crash if a user renamed/deleted default lists | **High** | 1 h |
| B3 | Follow requests are a dead end: no accept flow in the UI *and* the rules make it impossible to write the resulting `followers`/`following` docs | **Medium** | 3–6 h |
| B4 | "Game Card" detail panel can never show a description (list endpoint doesn't return `description_raw`) | **Medium** | 1–2 h |
| B5 | Local dev hits the local *function* but production Firestore/Auth (no emulator connection in the frontend) | **Medium** | 30 min |
| D1 | Every public playlist in the whole app is streamed to every user in real time (unbounded query) | **Medium** | 2 h |
| A1 | `App.jsx` god component; no router; view state as booleans; prop-drilling (24 props into `SearchDropdown`) | **High (velocity)** | 2–4 days |
| A2 | Anonymous sign-in for every visitor → account sprawl, orphaned boards, and anonymous users can create public playlists/relationships | **Medium** | 1 day |
| T1 | Tailwind v3 *and* `@tailwindcss/vite` v4 both installed; template README/title/favicon; debug button shipped to users; `console.log` of backend URL | **Low** | 1–2 h |

Sections 3–7 explain each of these with file references and a concrete fix.

---

## 3. Security & data-protection

### S1 — RAWG API key in git history (rotate now)

`git log -p -S'RAWG_API_KEY' -- functions/index.js` shows an old commit with the literal `const RAWG_API_KEY = "e5fe…06b7"`. The current code correctly uses `defineSecret("RAWG_API_KEY")` and `.secret.local` is gitignored, but history is forever and the repo has a GitHub remote (`carlos-tormo/gengemz`). Treat the key as public: regenerate it at rawg.io, update the Secret Manager value (`firebase functions:secrets:set RAWG_API_KEY`), redeploy. Optionally rewrite history with `git filter-repo`, but rotating is what actually matters.

The Firebase web config (`.env.local`) is also in history (commits `9dae089`…`515d2d4`). That API key is *designed* to be public, so no rotation is needed, but do two things: add HTTP-referrer restrictions to it in the Google Cloud console, and enable **Firebase App Check** so that only your deployed site can call Firestore/Functions with it.

### S2 — The current codebase is not in git

`git status` shows all of `services/`, `useBoard`, `useGameSearch`, `usePlaylists`, `useTheme`, `useUserProfile`, `BoardPage`, `BrowsePage`, `SearchDropdown` as **untracked**, plus large modifications to `App.jsx`, `functions/index.js` and `firestore.rules`. That is ~2,000 untracked and ~1,500 modified lines: the entire service/hook layer. Commit it before doing anything else, even as a single "WIP: snapshot before refactor" commit. Also delete or archive `~/ggz/zip/`, `~/ggz/src/`, and the root `package.json` — they are stale copies that will confuse both you and any agent you point at the folder.

### S3 — `searchGames` is an open, spoofable proxy for your RAWG quota

`functions/index.js`:

- `onRequest({ cors: true })` allows any origin. Anyone can embed your endpoint in their own site and drain your RAWG quota (and your Cloud Functions bill).
- No authentication. Not even a Firebase ID token or App Check token is checked.
- `getClientKey` trusts the *first* value of `X-Forwarded-For`. A client can send `X-Forwarded-For: 1.2.3.4` and Google's front-end will *append* the real IP, so the code reads the spoofed one → the rate limit is bypassed with one header.
- `requestLog` / `responseCache` are module-level `Map`s. Cloud Functions v2 runs on Cloud Run with multiple instances and cold starts, so the rate limit is per-instance and resets often; the cache is mostly ineffective too.

Fix, in order of value: (1) switch to `onCall` with `enforceAppCheck: true` (which also gives you the caller's uid for free), or keep `onRequest` and verify the `X-Firebase-AppCheck` header yourself with `getAppCheck().verifyToken()`; (2) restrict `cors` to your hosting domain(s); (3) drop the hand-rolled limiter or key it on `req.ip` (Cloud Run sets this from the trusted hop) and accept it as best-effort; (4) if you want real caching, put `Cache-Control` on the response and let Firebase Hosting rewrite `/api/**` to the function so the CDN caches it — that also removes the CORS problem entirely because the API becomes same-origin. Also: Node 24 has native `fetch`, so `node-fetch@2` can be removed.

### S4 — Boards are readable by the whole internet; "invite only" is cosmetic

`firestore.rules`, `match /users/{userId}/data/{docId}`:

```
allow read: if isOwner(userId) || (docId == "board" && hasVisibleProfile(appId, userId));
```

`hasVisibleProfile` does not call `signedIn()`, and it returns true for `invite_only` profiles. So an unauthenticated `curl` against the Firestore REST API can read the full board (every game, rating, favourite) of any user who is public *or* invite-only. The onboarding copy promises invite-only users that "people must request to follow" — but following gates nothing, because there is no rule that checks a `followers` doc before allowing the board read.

Same pattern for `public_profiles` (`get, list` without `signedIn()`), which is arguably fine for public profiles but leaks `photoURL` and `bio` of invite-only users to anonymous scrapers.

Fix: require `signedIn()` on all reads; for invite-only profiles, require `exists(/…/relationships/$(userId)/followers/$(request.auth.uid))` (and for that to be writable, see B3). Decide explicitly what "private" means and write the rules from that decision.

### S5 — Smaller security notes

- **Blocking is cosmetic.** `blockProfile` deletes the relationship docs, but nothing in the rules stops the blocked user from immediately re-following, re-requesting, or reading the board. Add a `!exists(/…/relationships/$(profileId)/blocked/$(request.auth.uid))` check to the follow/request write rules and to board reads.
- **Anonymous users are full citizens.** Because every visitor is `signInAnonymously`'d, `signedIn()` is true for everyone. Anonymous users can create *public* playlists (`validPlaylistCreate` only checks `ownerUid == auth.uid`) and send follow requests. Use `request.auth.token.firebase.sign_in_provider != "anonymous"` where social actions are concerned.
- **Rules only validate the first and last item** of `items` and `searchTokens` (`validPlaylistItems`, `validSearchTokens`). This is a known Firestore rules limitation and your comment-free code hides it; a client can put anything in the middle. Acceptable for now, but document it, and consider moving playlist items to a subcollection where each doc is validated.
- **Board contents are unvalidated** (`validBoard` only checks the three top-level keys and sizes). Any client can store arbitrary JSON up to the 1 MB doc limit under `games`. Since other users' boards are rendered (profile preview) and `cover` is injected into an inline `background: url(...)`, a malicious user can at least make viewers load arbitrary URLs. Low risk today; will matter when you add richer social views.
- **Debug button shipped to production.** Settings modal → "Initialize Database (Fix Search)" calls `createDebugProfiles`, which tries to write `public_profiles/debug_user_1…3`. Rules reject it for everyone except… nobody (the uids don't match), so it just throws an alert. Remove `createDebugProfiles` and the button.
- No **Firestore backups / PITR** are configured, and there is no account-deletion path (GDPR right-to-erasure will need a Cloud Function that removes board, settings, profile, playlists and relationships).

---

## 4. Correctness bugs

### B1 — `merge: true` means nothing is ever deleted from the board

`useDebouncedSave.js:22` saves the *entire* board with `setDoc(ref, newData, { merge: true })`. Firestore deep-merges maps under `merge`, so removing a key from `games` or `columns` on the client does **not** remove it on the server. The listener then fires with the merged (server-shaped) document and the "deleted" game is back in `data.games`.

Consequences you can reproduce today:

1. Delete a game, then open **List view** — it is still listed, with "List: Unknown", because `Object.values(data.games)` includes the orphan.
2. Delete a favourited game — it stays in the **Favorites Vault**.
3. Try to re-add the deleted game from search — you get "On board" / the duplicate modal, because `findExistingGameId` searches `data.games`.
4. Delete a column with "Delete games along with this list" — the games and the column both survive in Firestore (the column is only hidden because `columnOrder` is an array and arrays *are* replaced).
5. `validBoard` caps `games.keys().size() <= 500`; zombies count, so active users will eventually be unable to save at all.

Fix: the board doc is owned by exactly one client, so use `setDoc(ref, newData)` **without** merge (the state is the full document anyway). Add a one-off cleanup that drops `games` entries not referenced by any column's `itemIds` and `columns` entries not in `columnOrder`. Longer-term, see D2 (per-game documents).

### B2 — Hard-coded column ids crash on customised boards

`GameCard.jsx:69–71` has a "Move to…" menu with fixed `'backlog' | 'playing' | 'completed'`; `App.jsx:511` uses `zoomedColumnId || 'backlog'`; `Column.jsx:21` picks colours by those ids. Users can rename, delete (and, thanks to B1, zombify) these columns. If `backlog` is genuinely gone, `moveGameOnBoardData` does `data.columns[targetColumnId].itemIds` on `undefined` → uncaught TypeError. Render the menu from `data.columnOrder` (as `BoardPage`'s list view already does) and store a colour/accent on the column object.

### B3 — Follow requests can never be accepted

There is no "Requests" section in the Connections modal and no `accept` handler anywhere (`grep -ri accept frontend/src` → nothing). Worse, the rules would block a correct implementation: `validFollowers` requires `profilePrivacy(appId, userId) == "public"` and `validFollowing` only allows `status == "following"` when the target is public. So for an invite-only target, neither the `followers` doc nor the `following: following` status can ever be written. Fixing S4 properly depends on this. Design the state machine first (request → accept/decline → following; unfollow; block), then write rules and code from it. An "accept" that must atomically write to two users' subcollections is a good candidate for a callable Cloud Function or a `writeBatch` with rules that allow the *target* to create the requester's `following` doc.

### B4 — The Game Card detail panel is dead weight

`openGameCard` runs `runGameDetailSearch(mapped.title)` → `/games?search=title` and reads `results[0].description_raw`. RAWG's list endpoint never returns `description_raw` (only `/games/{id}` does), and the function only proxies the list endpoint. So the panel always shows "No additional description available." while costing one RAWG request per card open. Either add a `/games/:id` route to the proxy (you already store `rawgId`/`rawgSlug`) or remove the panel.

### B5 — Local dev writes to production Firestore

`constants.js` points `BACKEND_URL` at `127.0.0.1:5001` when on localhost, and `firebase.json` configures Auth/Firestore emulators, but `config/firebase.js` never calls `connectAuthEmulator` / `connectFirestoreEmulator`. Every local run creates real anonymous users and real documents in `gengemztest-9582e`. Add the two calls behind `import.meta.env.DEV` (or a `VITE_USE_EMULATORS` flag).

### B6 — Smaller bugs

- `BrowsePage.jsx:411` — year dropdown is `2025 - i`; it is 2026. Use `new Date().getFullYear()`.
- `playlistService.createPlaylist` returns `{ id, ...payload }` where `createdAt`/`updatedAt` are `serverTimestamp()` sentinels; `usePlaylists` pushes that object into state, so anything that formats those dates will break until the snapshot replaces it.
- `usePlaylists` both subscribes with `onSnapshot` *and* patches local state after every write (`applyPlaylistPatch`). One of the two is redundant and they can disagree briefly (flicker). Keep the subscription.
- `useBoard` marks data as loaded after a 3-second timeout even if the snapshot never arrives, so an offline user sees an empty board and can start "saving" over their real one once reconnected. Prefer surfacing the error state.
- Sign-in from a guest session uses `signInWithPopup` (a *new* account) plus a manual merge. `linkWithPopup(auth.currentUser, provider)` upgrades the anonymous account in place, keeps the uid, and makes `mergeGuestBoardIntoUserBoard` unnecessary in the common case.
- `onAuthStateChanged` in `App.jsx:236` is never unsubscribed.
- `frontend/package.json` `deploy` script does `cd frontend && …` but is already run from `frontend/`.
- `App.jsx` imports ~15 icons/components it never uses (`GameCard`, `Wrench`, `UserPlus`, `Unlock`, …). ESLint doesn't catch it because the config ignores unused vars matching `^[A-Z_]`. The "Edit Profile" modal (`isProfileModalOpen`) can never open.
- `functions/.eslintrc.js` says `ecmaVersion: 2018` on a Node 24 codebase; any optional chaining you add will be flagged.

---

## 5. Architecture & refactoring

### A1 — Break up `App.jsx` (the single biggest velocity win)

`App.jsx` currently owns: auth lifecycle, 51 pieces of state, all drag-and-drop, seven modals' JSX, the playlist detail table, the profile viewer, the connections manager, the onboarding form and the settings form. Every new feature will touch it, and every agent you point at it will need the whole file in context.

Suggested target structure (keep your existing `services/` and `hooks/` — they're the good part):

```
src/
  app/            App.jsx (providers + router only), routes.jsx
  features/
    auth/         AuthProvider.jsx, useAuth.js, LandingPage.jsx
    board/        BoardPage, Column, GameCard, GridGameCard, useBoard, boardService
    game/         GameCardModal.jsx (the "Game Card"), useGameSearch, rawgService
    playlists/    PlaylistsPage, PlaylistDetail, PlaylistSidebar, usePlaylists, playlistService
    social/       ProfileModal, ConnectionsModal, SearchDropdown, useRelationships, ...
    settings/     SettingsModal, OnboardingModal, useUserProfile, profileService
  components/ui/  Modal, Menu, Button, ConfirmDialog, Toast   (design-system primitives)
  lib/            firebase.js, constants.js
```

Concrete moves, in order of payoff:

1. **Add a router** (`react-router`). `isBrowsePage`, `isFavoritesView`, `isListView`, `zoomedColumnId`, `isPlaylistsModalOpen` + `selectedPlaylist`, `isProfileViewOpen` + `selectedProfile` are all URL state (`/board`, `/board/:columnId`, `/favorites`, `/browse`, `/playlists/:id`, `/u/:uid`). This deletes a dozen booleans, gives you the back button, deep links, and shareable profile/playlist URLs — which your social and marketplace ambitions need anyway.
2. **Extract each modal into its own component** with its own local state (`ratingHover`, `isMoveMenuOpen`, `deleteMode`, `hoveredPlaylistItemIdx`, …). None of that belongs at app level.
3. **Replace prop bags with context.** `BoardPage` receives `actions={{ …10 handlers }}`; `SearchDropdown` takes 24 props. A `BoardProvider` exposing `{ data, actions }` and a `useAuth()` context replace both.
4. **Replace `alert/prompt/confirm`** with a `ConfirmDialog` and a toast component. These 19 calls block the main thread, look broken on mobile, and are untestable.
5. **Consolidate the four `useGameSearch()` instances** — the add-modal, nav bar, playlist add and game-detail searches are the same feature with different result sinks. One search component, rendered in different slots.

### A2 — Rethink the anonymous-first auth model

Auto-`signInAnonymously` on load means every visit — bots included — creates a Firebase Auth user and, once they add a game, a board doc that is never cleaned up. It also makes `signedIn()` in the rules nearly meaningless (S5). Options: keep guest mode but store the guest board in `localStorage` and only create an account on sign-in; or keep anonymous auth but restrict social writes to non-anonymous providers and schedule a cleanup function for anonymous users older than N days (the Firebase extension "Delete User Data" plus a scheduled Auth cleanup covers this).

### A3 — Adopt TypeScript incrementally

The identity logic (`getGameIdentities`, `sameGameIdentity`) and the board mutations are exactly the kind of code where a `Game`, `Column`, `Board`, `PlaylistItem` type would have prevented the `platform: 'Unk'` / `genre: 'Gen'` placeholders in `handleAddGameFromSearch` and the `item.title`-keyed React keys. Vite supports mixed `.js`/`.ts`; start with `types.ts` + `services/` + `utils/`, leave JSX for later.

### A4 — Tests where they pay off

There are none. The cheapest high-value targets: unit tests for `boardService` (pure functions — `cleanGameDuplicates` and `addGameToBoardData` have subtle semantics), `gameUtils` identity matching, and **Firestore rules tests** with `@firebase/rules-unit-testing` against the emulator (this is how you'd have caught S4 and B3). Vitest is a drop-in with Vite.

---

## 6. Data model & scalability

### D1 — Unbounded public-playlist stream

`subscribeToVisiblePlaylists` opens `where('privacy','==','public')` with no `limit`, as a real-time listener, for every signed-in user. With 1,000 users each holding a 250-item playlist that is 1,000 doc reads per session start plus a live update to *every* client whenever *anyone* edits a public playlist. Load the browse view on demand with `limit` + `orderBy('updatedAt')` + cursor pagination, and keep the real-time listener only for the user's own playlists.

### D2 — One-document board

Storing the whole board as one document with a `games` map gives you atomic drag-and-drop but also: a 1 MB hard ceiling (roughly 2–4 k games with covers URLs), the 500-key cap you already had to add, whole-document rewrites on every keystroke of a rating, no ability to query "everyone who has Elden Ring in *Playing*", and the B1 merge trap. For the social / collection / marketplace direction you described, move to `users/{uid}/games/{gameId}` documents (one per game, with `columnId`, `position`, `rating`, `isFavorite`) and keep only `columns` + `columnOrder` on the board doc. Batch writes keep moves atomic. This is the one migration worth doing *before* adding more features.

### D3 — Path and naming leftovers

Everything lives under `artifacts/{APP_ID}/…` with `APP_ID = 'gengemz-prod'` while the Firebase project is `gengemztest-9582e`. The `artifacts/` nesting is the pattern from AI-studio starter templates and adds a `get()` to every rule check for nothing. Flatten to top-level collections (`users`, `profiles`, `playlists`, `relationships`) as part of the D2 migration, and use separate Firebase projects (`dev`/`prod`) with `.firebaserc` aliases instead of an `APP_ID` string.

### D4 — Denormalised names go stale

`displayName`/`photoURL` are copied into every relationship doc and into `ownerName` on playlists, and never updated when the user renames themselves in Settings. Either accept the staleness (fine for now), or add a Cloud Function trigger on `public_profiles` writes that fans out updates.

### D5 — Search

`searchTokens` prefix-token search is a reasonable Firestore hack, but it is case-folded prefix only, single-token, and capped at 80 tokens per user. When you need real search (games *and* users, typo-tolerant), Algolia/Typesense via the official extension will be far cheaper than extending this.

---

## 7. Tooling, DX and hygiene

- **Tailwind:** `tailwindcss@3` and `@tailwindcss/vite@4` are both in `devDependencies`; only v3 is wired (PostCSS). Pick v4 (`@tailwindcss/vite` plugin, `@import "tailwindcss"`, drop `postcss.config.js`/`autoprefixer`/`tailwind.config.js`) or delete the v4 package.
- **Dependency freshness (as of today):** React 19.2 ✓, Vite 7 → 8 available, Firebase 12.6 → 12.18, `firebase-functions` 7.0 → 7.3, `firebase-admin` 13 → 14, ESLint 8 (functions) → 10, `lucide-react` 0.555 → 1.x, `node-fetch` (remove). Run `npm audit` in both packages once the network is available; nothing here is exotic.
- **Template leftovers:** `index.html` title is "frontend", favicon is `vite.svg`, `README.md` is the Vite template, `react.svg` and the pre-2026 logo SVGs are unused, `constants.js` logs `BACKEND_URL` to the console on every load.
- **Two ESLint worlds:** flat config + ESLint 9 in `frontend/`, legacy `.eslintrc.js` + ESLint 8 + `eslint-config-google` in `functions/`. Unify on one flat config at the repo root.
- **No CI.** A GitHub Actions workflow that runs `npm ci && npm run lint && npm run build` on both packages, plus the rules tests from A4, is a 20-line file and will stop the "fix: Add missing Heart icon import" / "Revert" / re-fix commit pattern visible in the log.
- **Debug logs** (`firebase-debug.log` 250 KB, `firestore-debug.log`, `pubsub-debug.log`) are gitignored but sitting in the tree in three places; safe to delete.
- **Accessibility:** privacy options are clickable `<div>`s, dropdown menus have no keyboard navigation, `Modal` has no `role="dialog"`, focus trap or Escape handling. Worth doing while extracting the modals (A1 step 2), since you'll be touching them anyway.

---

## 8. What to keep

Worth saying explicitly, because a refactor that throws these away would be a regression:

- The **pure board mutation functions** in `boardService.js` (`addGameToBoardData`, `moveGameOnBoardData`, `cleanGameDuplicates`, `deleteColumnFromBoardData`). They are testable, immutable, and correctly separated from React.
- The **game identity model** (`getGameIdentities` / `sameGameIdentity`) — matching by `rawgId` → `rawgSlug` → normalised title, with `origin*` fields on playlist items, is the right idea and carries over directly to per-game documents.
- The **Firestore rules style**: helper functions, `keys().hasOnly()`, string length caps, `request.time` timestamp enforcement, and the deny-all fallback. Extend it; don't restart it.
- The **theme system** (CSS variables + `theme-light`/`theme-dark` class). Simple and it works.
- **Debounced save with status indicator** — good UX pattern; just drop `merge: true`.

---

## 9. Suggested roadmap

**Phase 0 — Stop the bleeding (half a day).** Rotate the RAWG key (S1). Commit everything and prune the stale `zip/`/`src/` copies (S2). Remove `merge: true` from the board save and ship the orphan-cleanup (B1). Connect the emulators locally (B5). Remove the debug button and the console log.

**Phase 1 — Secure the perimeter (1–2 days).** App Check on Firestore + Functions; restrict CORS or move the API behind Hosting rewrites; fix the rate-limit key (S3). Require `signedIn()` on reads and decide what invite-only/private/blocked actually mean, then encode it in rules (S4, S5). Write rules tests against the emulator so these decisions stay enforced (A4).

**Phase 2 — Restructure for development (1 week).** Router + feature folders + modal extraction + contexts (A1). Replace `alert/prompt/confirm`. Fix hard-coded column ids (B2). Consolidate the four search instances. Add Vitest for `boardService`/`gameUtils`. Set up CI. Tidy Tailwind/ESLint/template leftovers (T1).

**Phase 3 — Data model for the next stage (1–2 weeks).** Per-game documents + flat collections + dev/prod projects (D2, D3), with a migration script. Paginated public playlists (D1). Proper follow-request state machine with accept/decline (B3), and a real `/games/:id` detail proxy (B4). Reconsider anonymous-first auth (A2). Incremental TypeScript on the data layer (A3).

Each phase leaves the app deployable. Phase 0 and Phase 1 are worth doing by hand or with close supervision; Phase 2 is a good fit for the parallel-agent workflow, *provided* Phase 1's rules tests exist first so agents can't silently weaken security.
