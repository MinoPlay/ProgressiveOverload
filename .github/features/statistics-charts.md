# Feature: Statistics & Charts

## Purpose
Progress visualisation for logged workouts. Renders Chart.js charts in the **Statistics** tab. Lazy-initialised on first tab visit. Supports per-exercise line/bar charts, a muscle-group radar chart, week/month navigation, and personal-record annotations.

## Key Files
- `js/charts.js` — `Charts` singleton (rendering logic)
- `js/chart-helpers.js` — pure calculation utilities (no DOM)

## Chart State (`Charts` object)
```js
{
  selectedMuscleGroups: string[],   // persisted in localStorage
  selectedMetric: 'relative'|'weight'|'reps',  // persisted
  chartType: 'line'|'bar',          // persisted
  showPoints: boolean,              // persisted
  weekNavOffset: number,            // 0 = current week
  monthNavOffset: number,           // 0 = current month
  _cachedDataWithWorkouts: object|null,
  _cachedAllWorkouts: object|null
}
```

## Chart Helpers (`js/chart-helpers.js`)
| Function | Description |
|---|---|
| `calculateLinearRegression(points)` | Returns `{slope, intercept, predict, getTrendLine}` |
| `calculateMovingAverage(values, windowSize)` | Rolling average; returns `null` for insufficient data |
| `estimate1RM(weight, reps)` | Brzycki formula: `weight * (36 / (37 - reps))` |
| `findPersonalRecords(workouts)` | Returns PR entries tagged with `'weight'`, `'reps'`, `'volume'` |
| `aggregateByWeek(workouts)` | Returns weekly totals with muscle group breakdown |
| `calculateProgressPercentage(values)` | Baseline = avg of first 3 values; returns `%` array |
| `calculateVolumeDistribution(workouts)` | `{strength, hypertrophy, endurance}` by rep range |
| `categorizeRepRange(reps)` | `≤5` → strength, `≤12` → hypertrophy, else endurance |

## Key Methods (`Charts`)
| Method | Description |
|---|---|
| `init()` | Migrate stale state, call `renderCombinedChart()`, attach event listeners |
| `renderCombinedChart()` | Main entry point; reads Storage, builds all chart data, calls sub-renderers |

## Integration Points
- **Storage** — `getWorkoutsInRange` for multi-month data, `getExercises()` for exercise metadata
- **Events listened** — `exercisesUpdated`, `workoutsUpdated`, `themeChanged` → full re-render
- **Theme** — Chart.js global defaults (`Chart.defaults.color`, grid/tick colors) are updated by `Theme._applyChartDefaults` in `app.js`; charts re-render on `themeChanged`

## Rules & Constraints
- Chart.js and its plugins (zoom, annotation) are loaded via CDN and auto-register with Chart.js 4.x — do not import them as ES modules.
- Always destroy an existing chart instance before creating a new one on the same canvas to avoid memory leaks.
- `selectedMetric = 'volume'` is a legacy value — migrate to `'weight'` on init (already done in `Charts.init()`).
- 1RM estimation is only reliable for `reps ≤ 10`; the Brzycki formula caps at `reps = 30` to avoid negative denominators.
- Week start is **Monday** in all aggregation helpers (consistent with `js/utils.js`).
