# Feature: Backend Files

Reference for all non-UI, non-JS-module files: data files, dev server, service worker, PWA manifest, and utility scripts.

---

## Legacy Migration Files (`progressive-overload/`)

These JSON files are retained for migration and backup tooling. The browser app uses Supabase exclusively and does not read or write these files.

### File Overview

| File | Content shape | Purpose |
|---|---|---|
| `exercises.json` | `{ exercises: Exercise[] }` | Master exercise list |
| `workouts-YYYY-MM.json` | `{ workouts: WorkoutRecord[] }` | All workout records for one calendar month |
| `session-templates.json` | `{ templates: SessionTemplate[] }` | Saved session templates |
| `stats-summary.json` | Aggregated stats object | Pre-computed stats cache |

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

Migration tooling maps these records into Supabase exercise rows. The browser initializes new accounts through the Supabase `initialize_user_data` RPC instead.

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

Migration tooling combines the month-sharded files and maps each set into a Supabase workout row.

---

### `session-templates.json`

**Purpose:** Stores named session templates (ordered lists of exercises, optionally grouped as supersets).

Migration tooling maps these records into Supabase session-template rows.

---

### `stats-summary.json`

**Purpose:** Legacy pre-computed statistics cache. The Supabase app derives summaries from live workout rows and does not read or write this file.

---

## Dev Server

### `server.js`

**Purpose:** Minimal Node.js HTTP server for local development. Serves static files from the project root.

**Port:** `3001`

**Routes:**

| Method | Path | Description |
|---|---|---|
| `OPTIONS` | `*` | Returns CORS headers to allow cross-origin requests from the browser |
| Any | `*` | Serves the matching static file; falls back to 404 for unknown paths |

All paths are served as static files from the project root. Unknown paths return 404; server errors return 500.

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
| `po-static-{CACHE_VERSION}` | App shell: HTML, CSS, JS modules, and icons |
| `po-cdn-{CACHE_VERSION}` | CDN assets (Chart.js, etc.) cached on first use |

`CACHE_VERSION` is a hardcoded string constant (e.g. `'v53'`). Increment it to force all clients to discard stale caches on next activate.

### Fetch Strategies

| Request origin | Strategy |
|---|---|
| `*.supabase.co` | Network-only — never cached; always fresh |
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
