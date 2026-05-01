# Feature: Workout History

## Purpose
Read-only view of past workout sessions. Shows the last 90 days of workouts grouped by week, with a day-level modal drill-down. Lazy-initialised on first visit to the **History** tab.

## Key Files
- `js/history.js` — `History` singleton

## Data Model
History reads standard workout records from `Storage` (see `storage-github-sync.md` for the full workout record shape).

### Display grouping
```
Week (Mon–Sun)
  └─ Day (YYYY-MM-DD)
       └─ Session group (same date, ordered by `sequence`)
            └─ Workout record (exerciseId → name, reps, weight)
```

## Key Methods (`History`)
| Method | Description |
|---|---|
| `init()` | Attach modal event listeners (once), call `renderHistory()` |
| `renderHistory()` | Load last 90 days via `Storage.getWorkoutsInRange`, group by week, render into `#historyContent` |
| `openDayModal(dateStr)` | Open `#historyDayOverlay` showing all workouts for a specific date |
| `closeDayModal()` | Close the overlay |
| `renderDayWorkouts(workouts, date)` | Render workout cards inside the modal |
| `handleReorder(workoutId, direction, date)` | Swap `sequence` values and persist via `Storage.reorderWorkout` |

## Integration Points
- **Storage** — `getWorkoutsInRange(startDate, endDate)` (async, loads multiple monthly files), `getExerciseById(id)` to resolve names
- **Events listened** — `workoutsUpdated` triggers a full `renderHistory()` refresh
- **Lazy init** — `Charts.init()` and `History.init()` are called from `App.initNavigation` only when their tab is first visited

## Rules & Constraints
- History is **read-only** from the user's perspective; deletion is not supported in this view.
- `getWorkoutsInRange` may load up to 3 monthly JSON files — keep it lazy to avoid startup cost.
- Workout entries must be resolved to exercise names via `Storage.getExerciseById`; if the exercise was deleted, display a fallback (e.g. `'Unknown exercise'`).
- Week start is **Monday** (use `getWeekStart` from `js/utils.js`).
- The day modal (`#historyDayOverlay`) uses a click-outside-to-close pattern.
