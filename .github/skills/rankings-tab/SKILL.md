---
name: rankings-tab
description: >-
  Complete map of the ProgressiveOverload Rankings tab — the star-icon tab that
  ranks exercises or supersets by how many distinct days they were performed.
  Use this skill whenever the user asks to add to, change, fix, refactor, or
  understand the rankings page / rankings tab / star tab / exercise leaderboard
  / superset leaderboard / "most done exercises", the Exercises-vs-Supersets
  toggle, the trophy medals, the muscle filter row, or the 1M/3M/6M/1Y/All
  time-period filter row — even if they don't say the word "skill" or name a
  file. The tab lives in `js/rankings.js` plus a small section in `index.html`;
  it is NOT part of `js/charts.js` (the separate Statistics tab). Reach for this
  skill before grepping so you edit the right module and keep the day-counting,
  superset-grouping and tie-handling rules intact.
---

# Rankings Tab

The Rankings tab (star icon in the main nav) answers one question: **what has
the user actually done most often?** It counts *distinct days* — not sets, not
volume — and ranks highest-first, with trophies for the top three placements.
A toggle at the top switches what is being ranked: **Exercises** or **Supersets**.

It is a separate, much simpler tab from **Statistics** (`js/charts.js`, the
line-chart icon). Do not put ranking changes in `charts.js`, and do not put
Chart.js work here.

## The mental model

- **One source of data, loaded once.** `Rankings.load()` pulls the full
  all-time workout list (`Storage.loadStatsSummaryWorkouts()`, falling back to a
  10-year `Storage.getWorkoutsInRange()`) and caches it on `Rankings._workouts`.
  Filtering and mode switching never refetch — they re-filter the cache and
  re-render. The cache is invalidated only by the `workoutsUpdated` event.
- **A workout record is a single set**, shaped
  `{ exerciseId, date, reps, weight, sequence, supersetGroupId }`. Many records
  share one `date`. That is why counting uses a `Set` of `date` strings —
  logging five sets of Bench Press on one day counts as **one day**.
- **Superset membership comes from `supersetGroupId`**, written at submit time
  by `workout.html` for mutually-linked consecutive cards (see below). Records
  saved before that field existed have no group, so they never appear in
  superset rankings.
- **Mode and filters are pure view state**, persisted in `localStorage`
  (`rankingsMode`, `rankingsMuscleFilter`, `rankingsPeriod`) and re-applied on
  every `render()`.

## Where things live

| File | Role |
|---|---|
| `js/rankings.js` | The whole tab: `Rankings` singleton — data load, mode, filtering, ranking, DOM rendering. This is what you edit. |
| `index.html` | The nav button (`.nav-btn[data-section="rankings"]`, Lucide `star`) and `<section id="rankingsSection">` with `#rankingsModeExercises`/`#rankingsModeSupersets`, `#rankingsFilterMuscle`, `#rankingsFilterPeriod`, `#rankingsList`. |
| `js/app.js` | Lazy-init wiring in `initNavigation` — `switchSection` on first visit and `initActiveTab` on restore both call `Rankings.init()`. |
| `css/components.css` | `/* ─── Rankings Tab ─── */` block: `.rankings-mode-toggle`, `.rankings-period-row`, `.ranking-row`, `.ranking-rank.gold/.silver/.bronze`, `.filter-icon-row.disabled`. |
| `js/exercises.js` | Reused for the muscle row: `Exercises.renderIconChipButtons`, `getMuscleOptions`, `getMuscleFilterIcon`. Do not duplicate that chip code. |
| `workout.html` | Submit handler assigns a shared `ss-N` `supersetGroupId` to mutually-linked (`dataset.linkedWith`) consecutive cards. **This is the only producer of superset data.** |
| `js/storage.js` | `buildWorkoutRecord` persists `supersetGroupId`; `generateAndSaveStatsSummary` writes it as the compact `g` key and `loadStatsSummaryWorkouts` maps `g` back. |

## The mode toggle

`Rankings.setMode('exercises' | 'supersets')` — persisted, re-applied on init
via `setMode(this.mode, true)` (the `silent` flag skips rendering before the
data has loaded).

- **Exercises** — muscle row active, ranks individual exercises.
- **Supersets** — **the muscle row is disabled**, not hidden: `renderFilters()`
  adds `.disabled` to `#rankingsFilterMuscle`, sets `aria-disabled`, and sets
  `button.disabled` on every chip. The stored muscle selection is kept so it
  comes back when the user returns to Exercises, and `getRankedSupersets()`
  simply ignores it (a superset spans muscle groups by definition).
- The **period row stays active in both modes**.

## The two filter rows

- **Muscle row** — icon chips, identical to the Manage-tab exercise filter.
  Single-select; clicking the active chip deselects it, and *no selection means
  all muscles*. Backed by `Exercises.getMuscleOptions()`, so adding a muscle in
  `js/exercises.js` (`MUSCLE_OPTIONS`) automatically appears here, provided
  `assets/icons/filters/<muscle>.png` exists.
- **Period row** — text chips from the `PERIOD_OPTIONS` array at the top of
  `js/rankings.js`: `1M`, `3M`, `6M`, `1Y`, `All`. Exactly one is always active.
  **Deselecting a period falls back to `all`**, which is the required behaviour —
  keep that branch in the click handler if you touch it. `All` has
  `months: null`, and `getStartDateStr()` returns `''` for it, meaning no lower
  date bound.

## The ranking and trophy rules

These are the rules the feature exists for. Don't regress them.

1. **Rank by distinct days performed, descending**; ties break alphabetically by
   name (`getRankedExercises()` / `getRankedSupersets()`).
2. **A superset's identity is its *set* of exercises.** `getRankedSupersets()`
   groups records by `` `${date}|${supersetGroupId}` ``, drops groups of fewer
   than two exercises, then keys the combo on the alphabetically sorted exercise
   names joined with `' + '`. So A+B and B+A are one entry, and performing the
   same pairing twice in a day is still one day.
3. **Tiers are computed over *distinct counts*, not row positions.** `render()`
   builds `distinctCounts = [...new Set(rows.map(r => r.count))]` and the tier is
   `distinctCounts.indexOf(count)`. So if three entries tie for the top count,
   **all three get the gold trophy**, and the next distinct count gets silver —
   this is the explicitly requested "shared placement gets the highest trophy"
   behaviour. Never switch to array-index-based ranking.
4. **Tiers 0/1/2 render a Lucide `trophy`** coloured gold/silver/bronze via
   `.ranking-rank.gold|.silver|.bronze`. Tier 3+ renders the plain number
   `tier + 1`.
5. **Both ranker functions return the same row shape** —
   `{ name, muscle, count }` — so `createRankingRow()` serves both. Supersets
   pass `muscle: null`, which suppresses the muscle badge.

## The change workflow

1. **Orient.** Almost everything is in `js/rankings.js`; read it end-to-end
   first — it's short. Only reach into `index.html`/`css` for new markup or
   styling, and `js/app.js` only if the init contract changes.
2. **Pick the right seam.**
   - New filter or changed filtering → `getRankedExercises()` /
     `getRankedSupersets()` + `renderFilters()`.
   - New time period → add to `PERIOD_OPTIONS` (and widen the grid in
     `.rankings-period-row`, which is `repeat(5, 1fr)`).
   - New column/badge on a row → `createRankingRow()` + CSS (keep it shape-driven
     so both modes work).
   - New ranking mode → `setMode()`, a ranker returning the shared row shape, and
     the branch in `render()`.
   - Anything needing data the records don't carry → it must be produced in
     `workout.html` at submit, persisted in `Storage.buildWorkoutRecord`'s
     `optionalFields`, **and** added to the compact stats-summary encode/decode
     pair, or the Rankings tab will never see it.
3. **Bump `CACHE_VERSION` in `sw.js`** (repo rule), and if you add a new JS file
   add it to `STATIC_SHELL` there too.
4. **Verify.** `node server.js` (dev server, port 3001), open the app, click the
   star tab, and check both modes: trophies on the top three distinct counts,
   ties sharing a trophy, muscle chips disabled in Supersets and working in
   Exercises, each period chip, deselecting a period returning to `All`, and
   mode + filters surviving a refresh.

## Constraints that will bite you if ignored

- **Count days, not records.** Always dedupe by `date` with a `Set`. Summing
  record counts silently turns the leaderboard into a "most sets" board.
- **Superset data is only as good as the submit path.** If supersets rank empty,
  check that `workout.html` is still tagging linked cards and that
  `stats-summary.json` round-trips the `g` key — the summary is the primary read
  source, so dropping `g` there silently empties the tab.
- **Skip unknown exercises.** Both rankers look each `exerciseId` up in
  `Storage.getExercises()` and drop misses — deleted exercises still have
  workout history and would otherwise crash the renderer on `.name`.
- **Render names with `textContent`, never `innerHTML`** (XSS; repo rule).
  `createRankingRow()` builds nodes for this reason.
- **Re-run `window.lucide.createIcons()` after rendering rows**, or the trophy
  `<i data-lucide="trophy">` placeholders stay invisible.
- **Don't refetch on filter or mode changes.** Call `render()`; only `load()`
  fetches, and only when `_workouts` is null.
- **Keep the `Exercises` import for the muscle chips.** The circular
  `app.js ↔ exercises.js ↔ rankings.js` import is fine because usage is at
  runtime, and duplicating the chip renderer violates the repo's no-duplication
  rule.
- **4-space indent, single quotes, JSDoc on public methods** — `js/` module
  style. Note `workout.html` uses 2-space indent; match the file you're in.

