# Statistics Tab

The **Statistics** section (`#statisticsSection`) visualises training trends, muscle balance, and progressive overload using **Chart.js 4** with the zoom and annotation plugins.

---

## Design

The section is split into two logical areas:

1. **KPI Cards** (`#kpiGrid`) — summary numbers at the top.
2. **Period Tabs** (`#statsPeriodTabs`) — Weekly / Monthly / Overall panels below.

If no workout data exists, `#noStatsMessage` is shown instead of the dashboard.

---

## Initialisation

`Charts.init()` is called from `app.js` once on startup. It calls `renderCombinedChart()` and registers listeners for `exercisesUpdated`, `workoutsUpdated`, and `themeChanged` events so charts stay in sync.

---

## Data Loading

`Charts.loadAndRenderTabs()` fetches workout data for **all exercises** in parallel using `Storage.getWorkoutsForExercise()`. A date range is derived from `getDateRange()` (the last N sessions or a fixed window depending on the selected metric/view). Exercises with zero logged sets are excluded from charts.

---

## KPI Cards

Located in `#kpiGrid`, rendered by `renderKPICards()`. Each card shows:

| Card | Metric |
|------|--------|
| **This Week** | Count of distinct training days in the navigated week, with a trend indicator vs. the previous week (▲/▼/▶) |
| **This Month** | Count of distinct training days in the navigated month, with trend vs. the previous month |
| **Sessions per Muscle (Week)** | Collapsible `<details>` block listing each muscle trained this week with set counts |
| **Sessions per Muscle (Month)** | Same breakdown for the current month |

Trend indicators use the same colour scheme as History: green for up, red for down, neutral for flat. Collapse state for each muscle-session card is persisted in `localStorage` under `sessionsPerMuscleCollapsed:<period>`.

---

## Period Tabs

Three tabs switch between time-scoped panels. The last active tab is saved in `localStorage` under `statsPeriodTab`.

### Weekly Panel

- **Week navigation bar** — `‹` / `›` arrows step `Charts.weekNavOffset` ±1 week. The `›` button is disabled at offset 0 (current week). The label shows the Monday–Sunday date range of the displayed week.
- **Sessions Per Muscle (Week)** (`#muscleSessionsWeek`) — Inline table of muscles vs. session counts for the displayed week.
- **Muscle Balance radar** (`#muscleRadarWeekChart`) — Radar/spider chart showing relative session volume per muscle group for the displayed week.
- **Muscle Exercise Balance radar** (`#muscleRadarWeekExerciseChart`) — Same radar chart but counting unique exercises instead of sessions.

### Monthly Panel

- **Month navigation bar** — same pattern as week navigation, stepping `Charts.monthNavOffset` ±1 month.
- **Sessions Per Muscle (Month)** (`#muscleSessionsMonth`) — same as weekly but for the full calendar month.
- **Muscle Balance radar** (`#muscleRadarMonthChart`)
- **Muscle Exercise Balance radar** (`#muscleRadarMonthExerciseChart`)

### Overall Panel

Three cards:

#### Training Frequency
`#weeklyFrequencyChart` — Bar chart showing how many training days occurred each calendar week over the entire data window. Rendered by `renderWeeklyStats()`.

#### Progressive Overload
The main multi-tab progressive overload section:

- **Metric selector** (`#chartControls`) — three toggle pills:
  | Metric key | What is plotted |
  |------------|-----------------|
  | `relative` | Estimated 1-rep max (e1RM) using the Epley formula |
  | `weight` | Average weight per set |
  | `reps` | Average reps per set |
  The chosen metric is persisted in `localStorage` under `selectedMetric`.

- **Category tabs** (`#categoryTabs`) — one tab per muscle group. Tabs are rendered dynamically from the exercise data.

- **Tab content** (`#categoryTabContent`) — switching a muscle-group tab renders an individual line/bar chart for each exercise in that group on a shared canvas (or separate canvases per exercise). Each series shows the metric over time.

**Chart options available** (stored in `localStorage`):
| Option | Key | Values |
|--------|-----|--------|
| Chart type | `chartType` | `'line'` / `'bar'` |
| Show data points | `showPoints` | `true` / `false` |

#### Weekly Muscle Activity
`#weeklyMuscleChart` — Stacked bar chart where each bar is a calendar week, and each colour segment represents a muscle group. Height equals total sets logged for that muscle that week. Rendered by `renderWeeklyMuscleChart()` inside `renderWeeklyStats()`.

---

## Chart.js Setup

Charts are created/destroyed via `Charts.createChart()` which wraps `new Chart()`. Before creating, any existing chart on the same canvas is destroyed with `chart.destroy()` to avoid memory leaks.

Three CDN plugins are registered globally by Chart.js 4 auto-discovery:
- `chartjs-plugin-zoom` — pinch-to-zoom and mouse-wheel zoom on overload charts.
- `chartjs-plugin-annotation` — horizontal annotation lines (e.g., PR lines).

### Theme adaptation
When the `themeChanged` event fires, `Theme._applyChartDefaults(theme)` updates `Chart.defaults` for grid colours, label colours, and legend colours, then `Charts.renderCombinedChart()` re-renders all charts.

---

## Helper module (`chart-helpers.js`)

| Export | Purpose |
|--------|---------|
| `calculateLinearRegression(points)` | Least-squares line through `{x, y}` points |
| `calculateProgressPercentage(series)` | % change from first to last data point |
| `estimate1RM(weight, reps)` | Epley 1RM formula: `weight × (1 + reps/30)` |
| `findPersonalRecords(workouts)` | Returns the best 1RM per exercise across all data |
| `aggregateByWeek(workouts)` | Groups flat workout array into ISO-week buckets |
