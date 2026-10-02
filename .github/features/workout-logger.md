# Feature: Workout Logger

## Purpose
The primary UI for recording workout sets. `workout.html` is embedded as a full-height `<iframe>` inside `index.html`'s `workoutSection`. It has two tabs: **Plan** (build a session) and **Log** (quick single-set form, legacy).

## Key Files
- `workout.html` — standalone iframe page; owns the live planner/logger UI and posts saves to the parent
- `js/app.js` — parent `IframeBridge`; forwards Storage data and handles `po-save-workouts`

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

## Key Methods (`workout.html`)
| Method | Description |
|---|---|
| `serializeDesign1Cards()` | Read the card DOM into the persisted active-session shape |
| `applySavedDesign1State()` | Restore the active session from `localStorage` |
| `buildExerciseCard()` | Render one planned exercise card |
| Submit handlers | Validate completed sets and post `po-save-workouts` to the parent |

## Integration Points
- **IframeBridge** — parent sends `po-exercises`, `po-templates`, `po-workouts` on load; workout.html sends `po-save-workouts` on submit
- **Storage** — `addWorkoutsBatch()` is the only write path from this feature
- **Templates** — parent sends templates via `po-templates`; the iframe applies selected templates inside its own DOM
- **Events dispatched** — `workoutsUpdated` (via parent after save)

## Rules & Constraints
- workout.html runs in an iframe; it **cannot** import from `js/app.js` directly. All cross-frame communication must use the `po-*` postMessage protocol.
- Session state is persisted to `localStorage['workout.activeSession']` so a page refresh restores the in-progress session.
- Bodyweight exercises (`requiresWeight === false`) must not show or submit a weight field.
- The `sequence` field determines display order within a day — never omit it.
- All user-entered strings rendered to the DOM must use `textContent`, never `innerHTML`.
