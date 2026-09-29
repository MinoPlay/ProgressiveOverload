# Feature: Storage, Supabase & GitHub Sync

## Purpose
`Storage` is the stable data interface used by the application. Persistence is selected at startup:

- **Supabase** — multi-user source of truth with Supabase Auth and row-level security.
- **GitHub** — legacy JSON backend retained during migration and as a guarded rollback path.
- **Local** — existing browser-only mode.

Before cutover, a scheduled workflow reconciles the GitHub JSON snapshot into one configured Supabase user. After cutover, forward reconciliation must be disabled and a separate workflow exports Supabase data to a dedicated GitHub backup branch.

## Key Files
- `js/storage.js` — feature-facing `Storage` singleton and domain behavior.
- `js/storage-api.js` — backend selector.
- `js/github-api.js` — GitHub Contents adapter with SHA concurrency.
- `js/supabase-api.js` — tenant-scoped Supabase adapter.
- `js/supabase-auth.js` — email magic-link session handling.
- `js/supabase-client.js` — configured browser client for the `progressive_overload` schema.
- `js/supabase-records.js` — legacy JSON ↔ relational row mapping.
- `supabase/migrations/` — schema, RLS, grants, indexes, and user initialization.
- `scripts/` — forward reconciliation and reverse export commands.
- `.github/workflows/` — scheduled/manual migration and backup workflows.

## Stable Storage Interface
Feature modules continue to call `Storage`; they must not call a backend adapter directly.

| Method | Description |
|---|---|
| `initialize()` | Initialize the signed-in user, load exercises/current month/templates, and run sequence migration |
| `refreshFromRemote()` | Supabase only: re-fetch exercises/current month/templates; fires `*Updated` events only for changed data |
| `getExercises()` | Return the in-memory exercise snapshot |
| `addExercise`, `updateExercise`, `deleteExercise` | Validate and persist exercise changes |
| `addWorkout`, `addWorkoutsBatch` | Construct and persist workout records |
| `getWorkoutsInRange` | Return complete paginated history for a date range |
| `updateWorkout`, `deleteWorkout` | Mutate an existing workout |
| `getSessionTemplates` | Return the in-memory template snapshot |
| `addSessionTemplate`, `updateSessionTemplate`, `deleteSessionTemplate` | Persist template changes |

`buildWorkoutRecord` remains the only place that constructs persisted workout records.

## Supabase Freshness Rules
Supabase is the source of truth; the browser never persists its data locally (the service worker is network-only for `*.supabase.co`).

- `Storage.exercises`, `currentMonthWorkouts` and `sessionTemplates` are only a render snapshot. `App.refreshData()` re-fetches it on `visibilitychange` (visible) and on every tab switch; `IframeBridge` re-fetches before answering `po-request-*`.
- Every public mutation is wrapped by `Storage._write()`: it re-fetches the snapshot first (validation and sequence numbers use fresh data) and blocks background refreshes until done.
- Writes are row-level via `_persistExercises` / `_persistWorkouts` / `_persistSessionTemplates` → `upsert*` / `delete*` adapter methods. Never send a whole in-memory list to `SupabaseAPI.save*` from the app: those methods delete rows missing from the list.
- The GitHub backend keeps whole-file saves with SHA concurrency.

## Supabase Data Model
All tables live in the dedicated `progressive_overload` schema.

| Table | Purpose |
|---|---|
| `user_settings` | Idempotent per-user initialization marker |
| `exercises` | User-owned exercise definitions and last-set hints |
| `workouts` | User-owned relational workout sets |
| `session_templates` | User-owned templates with nested rows stored as JSONB |
| `sync_runs` | Service-role-only migration/backup audit records |

Every tenant table includes `user_id`; browser access is restricted by RLS to `auth.uid()`. The browser uses only the public Supabase publishable key. The service-role key is allowed only in local environment secrets and GitHub Actions secrets.

## Legacy GitHub Layout
| File | Content |
|---|---|
| `progressive-overload/exercises.json` | `{ exercises: Exercise[] }` |
| `progressive-overload/workouts-YYYY-MM.json` | `{ workouts: WorkoutRecord[] }` |
| `progressive-overload/session-templates.json` | `{ templates: SessionTemplate[] }` |
| `progressive-overload/stats-summary.json` | Derived aggregate; not authoritative in Supabase |

GitHub writes must always use the current file SHA. GitHub-only SHA and file-cache details must not be added to new feature callers.

## Migration Rules
- Forward sync is one-way: GitHub → Supabase.
- The source repository and directory come from `GITHUB_DATA_REPOSITORY` and `GITHUB_DATA_DIRECTORY`; defaults match this repository.
- Validate the complete snapshot and all exercise references before applying writes or deletions.
- Refuse an empty source snapshot that would erase existing target workouts.
- Preserve legacy IDs and optional session/superset metadata.
- Reconciliation is idempotent and deletes target rows absent from a fully validated source snapshot.
- All imported rows are assigned to `SUPABASE_LEGACY_USER_ID`.
- Set `SUPABASE_CUTOVER=true` when Supabase becomes authoritative; the scheduled forward job is guarded by that variable.
- Reverse export is one-way: Supabase → dedicated GitHub backup branch. It is not a bidirectional sync loop.
- Refuse an empty or mass-deletion backup unless `ALLOW_DESTRUCTIVE_BACKUP=true` is explicitly set for a reviewed run.

## Constraints
- Exercise names are case-insensitively unique per user.
- `weight: null` represents bodyweight.
- `sequence` is positive and orders sets within a day.
- Workout history queries must paginate beyond PostgREST's default row limit.
- Supabase Auth tokens must never cross the workout iframe bridge.
- The hosted Supabase project must expose the `progressive_overload` schema through its Data API settings.
