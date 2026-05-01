# Feature: Backend Files

Reference for all non-UI, non-JS-module files: data files, dev server, service worker, PWA manifest, and utility scripts.

---

## Data Files (`progressive-overload/`)

All data files live in the `progressive-overload/` directory of the user's GitHub repository. They are managed exclusively through `js/storage.js` (business logic) and `js/github-api.js` (HTTP layer). In dev mode, `dev-data.json` is used instead and is served/saved by the local `server.js`.

### File Overview

| File | Content shape | Purpose |
|---|---|---|
| `exercises.json` | `{ exercises: Exercise[] }` | Master exercise list |
| `workouts-YYYY-MM.json` | `{ workouts: WorkoutRecord[] }` | All workout records for one calendar month |
| `session-templates.json` | `{ templates: SessionTemplate[] }` | Saved session templates |
| `stats-summary.json` | Aggregated stats object | Pre-computed stats cache |
| `dev-data.json` | Same shape as `exercises.json` | Local dev-mode seed / working data |

---

### `exercises.json`

**Purpose:** Stores every user-defined exercise. Also carries `lastSets` and `lastDate` so the workout logger can show previous-session hints without loading any workout files.

**Exercise object shape:**
```json
{
  "id": "1769598356908_flvdqzdhf",
  "name": "Bench Press",
  "equipmentType": "barbell",
  "muscle": "chest",
  "requiresWeight": true,
  "lastSets": [{ "reps": 8, "weight": 80 }],
  "lastDate": "2025-04-28"
}
```

| Event | Action |
|---|---|
| First app load, file missing | Created with default seed exercises (`Storage.initializeDefaultExercises`) |
| User adds an exercise | New entry appended; file PUT to GitHub |
| User edits an exercise | Entry patched in-memory; file PUT to GitHub |
| User deletes an exercise | Entry spliced out; file PUT to GitHub |
| Workout saved | `lastSets` / `lastDate` updated on the matching exercise entry; file PUT to GitHub |
| `backfill-last-sets.py` run | `lastSets` / `lastDate` backfilled from historic workout files and file written locally |

---

### `workouts-YYYY-MM.json`

**Purpose:** Stores every individual set logged in a given calendar month. One file per month (e.g. `workouts-2025-04.json`).

**WorkoutRecord shape:**
```json
{
  "id": "1714300800000_abc123",
  "exerciseId": "1769598356908_flvdqzdhf",
  "date": "2025-04-28",
  "reps": 8,
  "weight": 80,
  "sequence": 1
}
```

| Event | Action |
|---|---|
| First workout of a new month saved | File created for that month via GitHub API |
| Any subsequent set logged in the same month | `currentMonthWorkouts` array updated in-memory; file PUT to GitHub |
| `Storage.getWorkoutsInRange(start, end)` called | Monthly files covering the range are fetched on demand (not cached beyond session) |
| `Storage.migrateSequenceNumbers()` on init | Adds missing `sequence` fields and re-saves if any were absent |

> **Note:** Only the current calendar month is held in `currentMonthWorkouts`. Reading historic months always goes through `getWorkoutsInRange`.

---

### `session-templates.json`

**Purpose:** Stores named session templates (ordered lists of exercises, optionally grouped as supersets).

| Event | Action |
|---|---|
| First template saved, file missing | File created with the new template |
| User saves a new template | Entry appended; file PUT to GitHub |
| User edits a template | Entry patched; file PUT to GitHub |
| User deletes a template | Entry spliced out; file PUT to GitHub |

---

### `stats-summary.json`

**Purpose:** Pre-computed aggregated statistics cache. Written after every workout save so the Statistics tab can render without re-processing all monthly files.

| Event | Action |
|---|---|
| Any workout write completes | `Storage.generateAndSaveStatsSummary()` called fire-and-forget; file PUT to GitHub asynchronously |

> **Note:** This write is non-blocking — it does not delay the workout save or any UI update. Stale stats are replaced on the next workout write.

---

### `dev-data.json`

**Purpose:** Local development seed/working data. Used only when the app runs in dev mode (served by `server.js`). Mirrors the shape of `exercises.json`.

| Event | Action |
|---|---|
| Repo cloned / initial setup | Ships with pre-seeded exercises (committed to the repo) |
| App running in dev mode saves exercises | `POST /api/dev-data` writes the updated JSON back to disk |
| App running in dev mode reads exercises | `GET /api/dev-data` reads the current file from disk |

---

## Dev Server

### `server.js`

**Purpose:** Minimal Node.js HTTP server for local development. Serves static files and provides a two-route API so the app can persist data locally without a GitHub token.

**Port:** `3001`

**API routes:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/dev-data` | Reads `progressive-overload/dev-data.json` and returns it as JSON |
| `POST` | `/api/dev-data` | Validates the request body as JSON, then writes it to `progressive-overload/dev-data.json` (pretty-printed, 2-space indent) |
| `OPTIONS` | `*` | Returns CORS headers to allow cross-origin requests from the browser |

All other paths are served as static files from the project root. Unknown paths return 404; server errors return 500.

**When to run:** Only during local development. Not needed in production (the app talks directly to the GitHub API).

---

### `dev-start.ps1`

**Purpose:** Convenience launch script. Checks whether Node.js is available, opens `http://localhost:3000` in the default browser, then starts `server.js`.

**When to run:** Run instead of `node server.js` directly for a one-step dev start. Falls back with manual instructions if Node.js is not found.

---

## Service Worker (`sw.js`)

**Purpose:** PWA service worker. Pre-caches the app shell on install and applies per-origin caching strategies on every fetch.

### Cache Buckets

| Cache name | Contents |
|---|---|
| `po-static-{CACHE_VERSION}` | App shell: HTML, CSS, JS modules, local JSON (`exercises.json`), icons |
| `po-cdn-{CACHE_VERSION}` | CDN assets (Chart.js, etc.) cached on first use |

`CACHE_VERSION` is a hardcoded string constant (e.g. `'v53'`). Increment it to force all clients to discard stale caches on next activate.

### Fetch Strategies

| Request origin | Strategy |
|---|---|
| `api.github.com` | Network-only — never cached; always fresh |
| `/api/*` (local dev API) | Network-only — bypassed so `server.js` always handles it |
| CDN origins (`unpkg.com`, `cdn.jsdelivr.net`) | Cache-first; populate cache on miss |
| Same origin (local static assets) | Cache-first; populate cache on miss; offline fallback to `index.html` for navigation requests |

### Lifecycle

| Event | Action |
|---|---|
| `install` | Pre-caches `STATIC_SHELL` file list; calls `skipWaiting()` to activate immediately |
| `activate` | Deletes all caches not in `[STATIC_CACHE, CDN_CACHE]`; claims all clients |
| `fetch` | Routes requests by origin/path according to the strategy table above |

---

## PWA Manifest (`manifest.json`)

**Purpose:** Standard [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest). Tells the browser how to present the app when installed as a PWA.

**Key fields:**

| Field | Value |
|---|---|
| `name` | `Progressive Overload Tracker` |
| `short_name` | `OverloadPro` |
| `display` | `standalone` |
| `orientation` | `portrait-primary` |
| `theme_color` | `#667eea` |
| `background_color` | `#1a1a2e` |
| `start_url` | `./` |

Three icon sizes are declared: 192×192, 512×512 (both PNG with `any maskable` purpose), and a scalable SVG favicon.

**Update cadence:** Static file — only modified when branding, icons, or PWA behaviour changes. Never written at runtime.

---

## Utility Scripts

### `backfill-last-sets.py`

**Purpose:** One-off migration script. Scans all `workouts-YYYY-MM.json` files in a data directory, finds the most recent session per exercise, and writes `lastSets` / `lastDate` back onto each exercise entry in `exercises.json`.

**Usage:**
```sh
python backfill-last-sets.py [data_dir]
# data_dir defaults to ./progressive-overload
```

**When to run:**
- After a bulk import of workout data where `lastSets` / `lastDate` are absent from exercises.
- Any time the exercise list is replaced and previous-session hints in the workout logger are missing.

**What it does not do:** It does not push changes to GitHub — it writes to the local file only. After running, commit and push `exercises.json` manually (or let the app overwrite it on next exercise save).

---

### `check-config.ps1`

**Purpose:** Pre-commit hook registered in `.githooks`. Currently a no-op placeholder that prints a success message.

**When it runs:** Automatically on every `git commit` (if `.githooks` is configured as the hooks directory via `git config core.hooksPath .githooks`).
