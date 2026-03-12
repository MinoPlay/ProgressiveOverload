# Workout Tab

The **Workout** section (`#workoutSection`) is the default view when the app loads. It presents three different workout-logging UIs as versioned sub-tabs (v1, v2, v3), each rendered inside its own `<iframe>`.

---

## Version Tabs

Three tab buttons sit above the iframe: **v1**, **v2**, **v3** (controlled by `index.html`). Clicking a tab:

1. Removes the `active` class from the previously visible iframe pane.
2. Adds `active` to the selected pane, making it visible.
3. The `<iframe>` uses `loading="lazy"` so the frame is not loaded until first selected (except v1 which is the default).

The active version is **not** persisted across page reloads — v1 is always the default.

---

## v1 — Classic Planner (`workout-v1.html`)

The original, form-based workout logger. Contains two internal views toggled by **Plan** and **Log** tabs:

### Plan view (default)

A vertical list of planned exercise rows. The user builds a session before it starts.

**How it works:**

1. **Load template** — A `<select>` dropdown at the top lists all saved session templates. Selecting one calls `Workouts.loadTemplateIntoPlanner(id)`, which populates the row list with exercises and default set counts from the template.
2. **Add exercise** — The `+` button opens the **Exercise Picker modal** (`#plannerExercisePickerModal`). The user selects an exercise from a drop-down and confirms. A new row is appended.
3. **Editing rows** — Each row shows the exercise name, a set counter and per-set reps/weight fields. Rows support:
   - Changing the exercise via the row's exercise drop-down (opens the picker).
   - Adding / removing individual sets with `+` / `−` buttons.
   - Clicking a set badge to mark it as the "active" set (highlighted).
4. **Persist draft** — Every field change calls `Workouts.persistPlannerDraft()`, which serialises the planned session into `localStorage` under `workout.activeSession`. Other iframes (v2/v3) receive the update via the `storage` event and can reflect it.
5. **Save as template** — The bookmark icon opens the **Save as Template modal** (`#saveAsTemplateModal`). The user enters a name and confirms; `Workouts.confirmSaveAsTemplate()` calls `Storage.addSessionTemplate()`.
6. **Submit** — The checkmark button (`#plannerSubmitBtn`) is enabled only when every row has an exercise and at least one completed set. On click, `Workouts.handlePlannedSubmit()` saves all rows as individual workout entries via `Storage.addWorkout()`, clears the session draft, and dispatches `workoutsUpdated`.

### Log view

A quick single-set entry form for logging one set at a time.

| Field | Notes |
|-------|-------|
| Muscle filter | Narrows the exercise dropdown to one muscle group |
| Exercise | Drop-down populated from `Storage.getExercises()` |
| Reps | Number input with `−` / `+` stepper buttons |
| Weight | Hidden for bodyweight exercises (`requiresWeight === false`) |
| Date | Date input, defaults to today. Changes are synced to the planner date |

Submitting the form calls `Workouts.handleSubmit(e)` → `Storage.addWorkout()` → dispatches `workoutsUpdated`.

**Last workout info** — below the exercise dropdown a panel shows the sets from the most recent session for the selected exercise. Clicking a set badge pre-fills the reps/weight fields.

**Last workout summary** — after a successful save, a summary card appears below the form showing all sets logged in the current session.

---

## v2 — Session Board (`session-board.html`)

A **mobile-style** active-session board. Designed to feel like a gym app screen. Accent color: `#667eea` (indigo/blue). Dark mode inverts to darker surface tones.

**Key design elements:**

- Fixed header with workout title and date chip.
- Scrollable content area with exercise cards stacked vertically.
- Bottom tab bar for internal navigation between phases (Plan / Active / Done).
- Each exercise card shows set rows with reps and weight fields. Completing a set ticks it off with a green checkmark.
- A rest timer can appear between sets.
- The planner draft from v1 (`workout.activeSession` in localStorage) is read on load so a session planned in v1 is immediately visible here.

Data flow is identical to v1: the iframe communicates with the parent via `postMessage` to receive exercises/templates/workouts and posts back `workoutsUpdated` on save.

---

## v3 — Workout Builder (`workout-builder.html`)

A **drag-and-drop session designer** with a distinct purple/violet accent scheme (`#7c3aed`) and a green accent for dark mode (`#22c55e`).

**Key design elements:**

- Card-based layout arranged in columns (on larger screens).
- Exercises can be dragged into an ordered plan.
- Superset blocks group two or more exercises together.
- Each added exercise row has set count and target reps/weight fields.
- A finish/save button commits the session.

Like v2, the builder reads the persisted session draft on load and writes back to the parent on save.

---

## Shared Behaviour Across All Versions

### Session draft persistence (cross-tab sync)

All three iframes and the parent page read/write `localStorage['workout.activeSession']`. The `storage` event on `window` fires in all same-origin contexts when any tab writes to localStorage, keeping all views in sync without explicit messaging.

### Exercise data delivery

The parent's `IframeBridge` sends a `po-exercises` postMessage to every iframe whenever exercises change. Each iframe caches the list in a local variable and updates `Storage.exercises` in-memory so the `Workouts` / planner modules see current data without a network round-trip.

### Template data delivery

Similarly, `po-templates` messages keep template dropdowns in sync across all iframes.

### Workout data delivery

`po-workouts` delivers the current month's workouts so each iframe can show "last workout" context.
