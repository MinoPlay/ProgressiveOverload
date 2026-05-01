# Feature: Storage & GitHub Sync

## Purpose
Central data layer. In production it persists exercises, workouts, and templates as JSON files in a user-configured GitHub repository via the REST API. In dev/demo mode `DevStorage` replaces `Storage` methods and reads from `progressive-overload/dev-data.json`.

## Key Files
- `js/storage.js` — `Storage` singleton (public API)
- `js/github-api.js` — `GitHubAPI` singleton (HTTP layer)
- `js/dev-storage.js` — `DevStorage` singleton (dev/demo override)
- `progressive-overload/exercises.json`
- `progressive-overload/workouts-YYYY-MM.json` (one file per month)
- `progressive-overload/session-templates.json`
- `progressive-overload/stats-summary.json`

## In-Memory Cache (Storage)
```js
{
  exercises: Exercise[],
  exercisesSha: string|null,
  currentMonthWorkouts: WorkoutRecord[],
  currentMonthSha: string|null,
  currentMonthPath: string|null,
  sessionTemplates: SessionTemplate[],
  sessionTemplatesSha: string|null
}
```

## GitHub API File Layout
| File | Content |
|---|---|
| `progressive-overload/exercises.json` | `{ exercises: Exercise[] }` |
| `progressive-overload/workouts-YYYY-MM.json` | `{ workouts: WorkoutRecord[] }` |
| `progressive-overload/session-templates.json` | `{ templates: SessionTemplate[] }` |
| `progressive-overload/stats-summary.json` | Aggregated stats cache (written async) |

## Key Storage Methods
| Method | Description |
|---|---|
| `initialize()` | Load exercises, current-month workouts, migrate sequences, load templates |
| `getExercises()` | Return in-memory exercise array |
| `getExerciseById(id)` | Find exercise by ID; returns `null` if not found |
| `addExercise(ex)` | Validate uniqueness, push, save to GitHub |
| `updateExercise(id, updates)` | Patch in-memory, save to GitHub |
| `deleteExercise(id)` | Splice in-memory, save to GitHub |
| `addWorkout(workout)` | Build record, push to current month cache, save |
| `addWorkoutsBatch(workouts)` | Batch-save multiple records for a single date |
| `getWorkoutsInRange(start, end)` | Load monthly files covering the range; returns flat array |
| `getSessionTemplates()` | Return in-memory templates array |
| `addSessionTemplate(tmpl)` | Push, save to GitHub |
| `updateSessionTemplate(id, updates)` | Patch, save to GitHub |
| `deleteSessionTemplate(id)` | Splice, save to GitHub |

## Key GitHubAPI Methods
| Method | Description |
|---|---|
| `getExercises()` | GET exercises file; returns `{exercises, sha}` |
| `saveExercises(exercises, sha)` | PUT exercises file; `sha` required for update (null for create) |
| `getWorkouts(date)` | GET monthly workouts file for the month containing `date` |
| `saveWorkouts(date, workouts, sha)` | PUT monthly workouts file |
| `listFiles(path)` | List directory contents; cached per session |
| `_invalidateCache(filePath)` | Clear file + parent-dir cache entries after write |

## Dev Mode Behaviour
- `CONFIG.devMode` is `true` on localhost/file protocol or when GitHub is not configured.
- `DevStorage` methods replace `Storage` methods via `Object.assign(Storage, DevStorage)` in `app.js`.
- On localhost, writes go to `progressive-overload/dev-data.json` via `POST /api/dev-data` (served by `server.js`).
- On a deployed static host (guest mode), writes are no-ops with a console log.

## Rules & Constraints
- **Always pass the current SHA** when saving a file that already exists — GitHub will reject the PUT with 409 if the SHA is wrong or missing.
- `currentMonthWorkouts` and `currentMonthSha` only cover the **current calendar month**. Cross-month reads must use `getWorkoutsInRange`.
- `buildWorkoutRecord` is the only place a `WorkoutRecord` is constructed — use it; do not create records manually.
- `generateAndSaveStatsSummary()` is called after every workout write; it is fire-and-forget (does not block the UI).
- Exercise names are case-insensitively unique — enforce in `addExercise` and `updateExercise`.
