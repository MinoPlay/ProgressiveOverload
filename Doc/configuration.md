# Configuration & Data Storage

## Overview

The app operates in one of two modes, switched at runtime from the **Configuration** panel inside the navigation dropdown:

| Mode   | Backend                       | Where data lives |
|--------|-------------------------------|------------------|
| Local  | `localStorage` + `dev-data.json` | Browser + local file |
| GitHub | GitHub REST API v3            | Git repository   |

---

## Mode Detection

`js/config.js` auto-detects the environment on page load:

```js
devMode: window.location.hostname === 'localhost' ||
         window.location.hostname === '127.0.0.1' ||
         window.location.protocol === 'file:'
```

- **`devMode: true`** — the app swaps the `Storage` singleton's methods with `DevStorage` at startup (`app.js → initApp()`), bypassing GitHub entirely.
- **`devMode: false`** — the app uses the `Storage` singleton backed by `GitHubAPI`.

The user can also manually switch between Local and GitHub mode via the Configuration panel at any time; the choice is persisted in `localStorage` under the key `app_config`.

---

## Configuration Panel

Accessible from the navigation dropdown under **Configuration** (a collapsible section toggled with a chevron button). The panel contains:

### Mode Toggle
Two buttons — **Local** and **GitHub** — that call `setMode('local')` / `setMode('github')`. The active mode is highlighted. Switching mode immediately updates localStorage and re-renders the panel.

### GitHub sub-panel (shown in GitHub mode)
| Field | Description |
|-------|-------------|
| GitHub Token | Personal Access Token (PAT) with `repo` scope, stored in `localStorage` under `app_config.token` |
| GitHub Username | Repository owner (e.g. `MinoPlay`) |
| Repository Name | Repository name (e.g. `ProgressiveOverload`) |

Clicking **Save** validates that all three fields are filled, writes them to `localStorage` as JSON under `app_config`, and reloads the page to apply the new settings.

### Local sub-panel (shown in Local mode)
| Button | Action |
|--------|--------|
| Sample Data | Calls `generateDummyData()` (not yet implemented — shows info toast) |
| Clear Data | Calls `clearLocalData()` — deletes all `localStorage` entries after a confirmation prompt |

---

## Local Development

### Starting the dev server

```powershell
node server.js          # starts http://localhost:3000
# or use the helper script:
.\dev-start.ps1
```

`server.js` is a minimal Node.js HTTP server (CommonJS, no npm dependencies):

- **`GET /api/dev-data`** — reads `data/dev-data.json` and returns it as JSON.
- **`POST /api/dev-data`** — receives JSON in the request body and writes it back to `data/dev-data.json`.
- All other requests are served as static files from the project root.

### Data file: `data/dev-data.json`

Single flat JSON file with three top-level keys:

```json
{
  "exercises": [ ... ],
  "workouts":  [ ... ],
  "templates": [ ... ]
}
```

`DevStorage` (`js/dev-storage.js`) loads this file on `initialize()` and persists every mutation back via `POST /api/dev-data`.

### In-memory cache (dev)

`DevStorage` mirrors the same public API as `Storage` (same property names and method signatures). Both maintain an in-memory cache:

| Property | Type | Description |
|----------|------|-------------|
| `exercises` | `Exercise[]` | All exercise definitions |
| `currentMonthWorkouts` | `Workout[]` | Workouts for the current calendar month |
| `sessionTemplates` | `Template[]` | Pre-planned session templates |
| `*Sha` | `string` | SHA placeholders (`'dev-sha-*'`) mirroring the GitHub storage interface |

---

## Deployed (GitHub mode)

### Authentication

`Auth` (`js/auth.js`) reads the PAT from `localStorage`, first looking at `app_config.token` (set via the Configuration panel) and falling back to the legacy `github_pat` key. There is no server-side component — all requests go directly to the GitHub REST API from the browser.

### Data layout in the repository

```
data/
  exercises.json             ← exercise catalogue
  session-templates.json     ← saved session templates
  workouts-2025-01.json      ← workouts for January 2025
  workouts-2025-02.json      ← workouts for February 2025
  ...
```

Workouts are partitioned by calendar month. Each monthly file holds an array of workout objects. The `Storage` module (`js/storage.js`) always loads the **current month's** file on startup and fetches older months on demand when History or Statistics need data from a wider date range.

### Read/write flow (GitHub mode)

1. **Load** — `GitHubAPI.getFile(path)` fetches the file, decodes base64, parses JSON, and returns `{ content, sha }`. The SHA is stored in memory and required for subsequent writes to prevent conflicts.
2. **Save** — `GitHubAPI.putFile(path, content, message, sha)` encodes content to base64 and calls the GitHub Contents API (`PUT /repos/:owner/:repo/contents/:path`). A successful response returns a new SHA that replaces the old one in memory.
3. **New month** — On the first save of a new calendar month, `putFile` is called with `sha = null`, creating the file.

### Commit messages

Each write creates a Git commit directly in the repository. Commit messages are generated automatically, for example:
- `'Update exercises'`
- `'Add workout 2025-03-12'`
- `'Update session templates'`

---

## localStorage keys used at runtime

| Key | Owner | Content |
|-----|-------|---------|
| `app_config` | `config.js` | `{ mode, token, owner, repo }` |
| `github_pat` | `auth.js` (legacy) | Raw PAT string |
| `theme` | `app.js` Theme | `'light'` or `'dark'` |
| `selectedMuscleGroups` | `charts.js` | `string[]` — active muscle filter in Statistics |
| `selectedMetric` | `charts.js` | `'relative'` \| `'weight'` \| `'reps'` |
| `chartType` | `charts.js` | `'line'` \| `'bar'` |
| `showPoints` | `charts.js` | `'true'` \| `'false'` |
| `activeManageTab` | `exercises.js` | `'exercises'` \| `'templates'` |
| `workout.activeSession` | `workouts.js` | JSON-serialised planned session (cross-tab sync) |
| `workoutActiveView` | `workouts.js` | `'plan'` \| `'log'` |
