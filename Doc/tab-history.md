# History Tab

The **History** section (`#historySection`) shows all workout data from the last **90 days**, grouped by calendar week and then by date within each week.

---

## Design

The view is a single scrollable list of **week group** cards rendered inside `#historyContent`. No pagination — all qualifying weeks are rendered at once.

```
▼ Week 11 (Mar 10 – Mar 16, 2026)  [Current]
  ├── Weekly Summary  (muscle totals + trend vs previous week)
  └── Daily History
        ├── Tue Mar 12
        │     ├── Bench Press — 3×8 @ 80 kg
        │     └── Overhead Press — 3×10 @ 50 kg
        └── Mon Mar 11
              └── Squat — 4×5 @ 100 kg
▶ Week 10 (Mar 3 – Mar 9, 2026)   [collapsed]
▶ Week 09 (Feb 24 – Mar 2, 2026)  [collapsed]
...
```

---

## Initialisation

`History.init()` is called from `app.js` on startup. It calls `renderHistory()` once and registers a listener on `window` for the `workoutsUpdated` custom event so the view refreshes automatically after any save.

---

## Data Loading

`renderHistory()` calls `Storage.getWorkoutsInRange(startDate, endDate)` with a 90-day window. In **GitHub mode** this may trigger fetches for multiple monthly files (e.g. the current month and up to two prior months). In **dev mode** it reads from the in-memory `DevStorage.currentMonthWorkouts` array (only the current month).

---

## Week Groups

Each week group is created by `createWeekGroup(weekStartStr, weekData, currentStats, previousStats, isCurrentWeek)`.

| Property | Description |
|----------|-------------|
| **Header** | ISO week number + Mon–Sun date range + year; clicking toggles the group open/closed |
| **Current week badge** | Shows "Current" label for the week containing today |
| **Collapsed by default** | Past weeks start collapsed; the current week starts expanded |

A week group contains two collapsible sub-sections:

### 1. Weekly Summary

A compact table of muscle groups trained during the week, with a count of distinct exercise-day pairs per muscle.

Each row shows a **trend indicator** compared to the same muscle count in the previous week:

| Indicator | Meaning |
|-----------|---------|
| `▲ +N` (green) | More exercise-days for this muscle than last week |
| `▼ −N` (red) | Fewer exercise-days than last week |
| `▶ 0` (neutral) | Same count as last week |
| `—` | No previous week to compare against |

The Summary sub-section starts **expanded** for the current week, collapsed for past weeks.

### 2. Daily History

Dates within the week are listed newest-first. Each date card shows all workouts logged that day, sorted by their `sequence` number (order in which they were logged).

Each workout entry displays:
- Exercise name
- Muscle group chip
- Each set: reps × weight (or just reps for bodyweight exercises)
- Edit (pencil icon) and Delete (trash icon) action buttons

The Daily History sub-section starts **collapsed** for all weeks.

---

## Editing a Workout

Clicking the **edit** icon on a workout entry opens an inline edit form directly beneath the entry. The user can change:

- Exercise (dropdown)
- Date
- Each set's reps and weight
- Add or remove sets

Saving calls `Storage.updateWorkout(id, updates)` and dispatches `workoutsUpdated`.

---

## Deleting a Workout

Clicking the **delete** icon triggers a confirmation via `window.confirm()`. On confirm, `Storage.deleteWorkout(id)` is called and `workoutsUpdated` is dispatched.

---

## Sequence Numbers

Within a single date, workouts have a `sequence` integer (1, 2, 3…) that reflects logged order. On storage initialisation, `Storage.migrateSequenceNumbers()` assigns sequences to any existing workouts that predate the field, using lexicographic sort on the workout ID (which embeds a timestamp) as a proxy for original order.

---

## Drag-and-Drop Reordering

Within a day group, workouts can be reordered by dragging. `History.draggedWorkout` and `History.draggedDate` track the in-flight drag state. On drop, the sequences of all workouts on that date are recalculated and saved.
