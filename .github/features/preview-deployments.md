# Preview Deployments (parallel branch versions on GitHub Pages)

## Goal
Test different versions in parallel without breaking main. Every branch is live at its own URL.

## URLs
- `main` → `https://minoplay.github.io/ProgressiveOverload/`
- any other branch → `https://minoplay.github.io/ProgressiveOverload/preview/<slug>/`
- index of all previews → `https://minoplay.github.io/ProgressiveOverload/preview/`
- `<slug>` = branch name lowercased, every char outside `[a-z0-9-]` → `-`
  (e.g. `MKUC/skill-and-data` → `mkuc-skill-and-data`).

## Deploy (`.github/workflows/pages.yml`)
- Triggers: `push` (all branches), `delete` (branch), `workflow_dispatch`.
- Each run rebuilds the WHOLE site from every remote branch (`git archive`) → a deleted
  branch disappears on the next run. `concurrency: pages`, cancel in progress.
- Dev-only files stripped: `node_modules`, `test(s)`, `Doc`, `scripts`, `supabase`, `.github`,
  `.githooks`, `package*.json`, `server.js`, `*.ps1`, `backfill-last-sets.py`, `README.md`, etc.
- One-time repo setup:
  - Pages source = **GitHub Actions**:
    `gh api -X PUT repos/MinoPlay/ProgressiveOverload/pages -f build_type=workflow`
  - Environment `github-pages` → Deployment branches: allow **all branches**
    (the default rule only lets `main` deploy).

## Isolation (same origin → must namespace)
`js/deploy-env.js` is a **classic script** (no import/export) exposing global `DeployEnv`. It is
loaded synchronously in the `<head>` of `index.html` and `workout.html` (before any storage
access) and via `importScripts()` in `sw.js`. Deploy id comes from the URL path:
- `getDeployId(pathname)` → `''` for main, `<slug>` when path has `/preview/<slug>/`.
- `nsPrefix(id)` → `''` for main, `preview-<slug>:` for a preview.

Rules:
- **Main unchanged**: all storage keys and cache names identical to before (no migration).
- **localStorage + sessionStorage**: in a preview, `installStorageNamespace` patches
  `Storage.prototype` so every key is transparently prefixed with `preview-<slug>:`;
  `length`/`key(i)`/`clear()` only see/touch own-namespace keys. Runs in each document
  (the `workout.html` iframe has its own realm, hence its own `<script>` tag).
- **Cross-tab `storage` events**: `installStorageEventNamespace` patches `StorageEvent.prototype.key`
  → own keys un-prefixed, other deploys' keys `null`. Existing listeners need no changes.
- **Cache API**: `getCacheName(kind, version, id)` → `po-<kind>-<v>` (main) /
  `po-<slug>-<kind>-<v>` (preview). `isOwnCache(name, id)` — SW `activate` and Settings
  "Refresh cache" delete only own caches (main never wipes preview caches, and vice versa).
- **SW scope**: main SW scope `/ProgressiveOverload/` also covers `/preview/*` → main SW does
  NOT handle same-origin requests whose deploy id differs from its own.
- **Refresh cache** unregisters only the SW registration whose scope belongs to this deploy.
- **"Clear local data"** uses `localStorage.clear()` → in a preview only own keys; on main it
  still clears everything (including preview keys) — accepted.

## Backend
A preview uses whatever backend (local / GitHub / Supabase) is set in ITS Configuration. Pointing
it at the production Supabase project or data repo means writes are REAL. User choice, by design.

## Caveat — branches without this code
Isolation lives in the app code. A branch forked BEFORE this feature deploys fine but is NOT
isolated (shares main's localStorage; its SW `activate` wipes all other caches). Merge main into
the branch to get isolation. Slug collisions (e.g. `a/b` vs `a-b`) → last one wins.

## UI
Settings cache-version label shows ` · preview:<slug>` when running as a preview.

## Tests
`tests/deploy-env.test.mjs` (`npm test`).
