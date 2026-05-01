# Feature: Workout Logger

## Purpose
The primary UI for recording workout sets. `workout.html` is embedded as a full-height `<iframe>` inside `index.html`'s `workoutSection`. It has two tabs: **Plan** (build a session) and **Log** (quick single-set form, legacy).

## Key Files
- `workout.html` — standalone page; runs `js/workouts.js` directly
- `js/workouts.js` — `Workouts` singleton; owns all planner logic

## Data Model

### Planned Session (in-memory + `localStorage['workout.activeSession']`)
```js
{
  id: string,          // 'session-<timestamp>'
  date: string,        // 'YYYY-MM-DD'
  rows: PlannedRow[]
}
```

### PlannedRow
```js
{
  rowId: string,
  exerciseId: string,
  exerciseName: string,
  sets: PlannedSet[],
  supersetGroupId?: string   // links consecutive superset exercises
}
```

### PlannedSet
```js
{
  setId: string,
  reps: number|null,
  weight: number|null,
  completed: boolean
}
```

### Workout Record (persisted via `Storage.addWorkoutsBatch`)
```js
{
  id: string,
  exerciseId: string,
  date: string,          // 'YYYY-MM-DD'
  reps: number,
  weight: number|null,   // null for bodyweight
  sequence: number,      // ordering within a date
  sessionId?: string,
  plannedSetId?: string,
  supersetGroupId?: string,
  supersetRound?: number,
  source?: string,
  supersetExercises?: string[]
}
```

## Key Methods (`Workouts`)
| Method | Description |
|---|---|
| `init()` | Wire up events, populate dropdowns, restore saved session |
| `initializePlanner()` | Restore `plannedSession` from `localStorage` or start fresh |
| `renderPlannedSession()` | Re-render all exercise cards in `#plannedSessionList` |
| `handlePlannedSubmit()` | Validate and call `Storage.addWorkoutsBatch`, then post `po-workouts-saved` to parent |
| `loadTemplateIntoPlanner(id)` | Replace current session rows with a template's exercises |
| `handleSaveAsTemplate()` | Open modal → `Templates.saveTemplate()` from current planner rows |
| `openPlannerExercisePicker(ctx)` | Open exercise picker modal; `ctx.mode` is `'add'` or `'replace'` |
| `normalizePlannedRow(row, index)` | Ensure a row has all required fields with defaults |

## Integration Points
- **IframeBridge** — parent sends `po-exercises`, `po-templates`, `po-workouts` on load; workout.html sends `po-save-workouts` on submit
- **Storage** — `addWorkoutsBatch()` is the only write path from this feature
- **Templates** — planner loads templates via `Storage.getSessionTemplates()`
- **Events dispatched** — `workoutsUpdated` (via parent after save)

## Rules & Constraints
- workout.html runs in an iframe; it **cannot** import from `js/app.js` directly. All cross-frame communication must use the `po-*` postMessage protocol.
- Session state is persisted to `localStorage['workout.activeSession']` so a page refresh restores the in-progress session.
- Bodyweight exercises (`requiresWeight === false`) must not show or submit a weight field.
- The `sequence` field determines display order within a day — never omit it.
- All user-entered strings rendered to the DOM must use `textContent`, never `innerHTML`.
