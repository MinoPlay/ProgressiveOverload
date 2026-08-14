---
name: rankings-tab
description: >-
  Complete map of the ProgressiveOverload Rankings tab — the star-icon tab that
  ranks exercises by how many distinct days they were performed. Use this skill
  whenever the user asks to add to, change, fix, refactor, or understand the
  rankings page / rankings tab / star tab / exercise leaderboard / "most done
  exercises", the trophy medals, the muscle filter row, or the 1M/3M/6M/1Y/All
  time-period filter row — even if they don't say the word "skill" or name a
  file. The tab lives in `js/rankings.js` plus a small section in `index.html`;
  it is NOT part of `js/charts.js` (the separate Statistics tab). Reach for this
  skill before grepping so you edit the right module and keep the day-counting
  and tie-handling rules intact.
---

# Rankings Tab

The Rankings tab (star icon in the main nav) answers one question: **which
exercises has the user actually done most often?** It counts *distinct days*
per exercise — not sets, not volume — and ranks them highest-first, with
trophies for the top three placements.

It is a separate, much simpler tab from **Statistics** (`js/charts.js`, the
line-chart icon). Do not put ranking changes in `charts.js`, and do not put
Chart.js work here.

## The mental model

- **One source of data, loaded once.** `Rankings.load()` pulls the full
  all-time workout list (`Storage.loadStatsSummaryWorkouts()`, falling back to a
  10-year `Storage.getWorkoutsInRange()`) and caches it on `Rankings._workouts`.
  Filtering never refetches — it re-filters the cache and re-renders. The cache
  is invalidated only by the `workoutsUpdated` event.
- **A workout record is a single set**, shaped
  `{ exerciseId, date, reps, weight, sequence }`. Many records share one `date`.
  That is why counting uses a `Set` of `date` strings per exercise — logging
  five sets of Bench Press on one day counts as **one day**.
- **Filters are pure view state**, persisted in `localStorage`
  (`rankingsMuscleFilter`, `rankingsPeriod`) and re-applied on every `render()`.

## Where things live

| File | Role |
|---|---|
| `js/rankings.js` | The whole tab: `Rankings` singleton — data load, filtering, ranking, DOM rendering. This is what you edit. |
| `index.html` | The nav button (`.nav-btn[data-section="rankings"]`, Lucide `star`) and `<section id="rankingsSection">` with `#rankingsFilterMuscle`, `#rankingsFilterPeriod`, `#rankingsList`. |
| `js/app.js` | Lazy-init wiring in `initNavigation` — `switchSection` on first visit and `initActiveTab` on restore both call `Rankings.init()`. |
| `css/components.css` | `/* ─── Rankings Tab ─── */` block: `.rankings-period-row`, `.ranking-row`, `.ranking-rank.gold/.silver/.bronze`, `.ranking-name`, `.ranking-count`. |
| `js/exercises.js` | Reused for the muscle row: `Exercises.renderIconChipButtons`, `getMuscleOptions`, `getMuscleFilterIcon`. Do not duplicate that chip code. |

## The two filter rows

Row one is **muscle**, row two is **time period** — deliberately two levels.

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
   exercise name (`getRankedExercises()`).
2. **Tiers are computed over *distinct counts*, not row positions.** `render()`
   builds `distinctCounts = [...new Set(rows.map(r => r.count))]` and the tier is
   `distinctCounts.indexOf(count)`. So if three exercises tie for the top count,
   **all three get the gold trophy**, and the next distinct count gets silver —
   this is the explicitly requested "shared placement gets the highest trophy"
   behaviour. Never switch to array-index-based ranking.
3. **Tiers 0/1/2 render a Lucide `trophy`** coloured gold/silver/bronze via
   `.ranking-rank.gold|.silver|.bronze`. Tier 3+ renders the plain number
   `tier + 1`.

## The change workflow

1. **Orient.** Almost everything is in `js/rankings.js`; read it end-to-end
   first — it's short. Only reach into `index.html`/`css` for new markup or
   styling, and `js/app.js` only if the init contract changes.
2. **Pick the right seam.**
   - New filter or changed filtering → `getRankedExercises()` + `renderFilters()`.
   - New time period → add to `PERIOD_OPTIONS` (and widen the grid in
     `.rankings-period-row`, which is `repeat(5, 1fr)`).
   - New column/badge on a row → `createRankingRow()` + CSS.
   - Different ranking metric → `getRankedExercises()` only; keep the tier code
     in `render()` untouched so tie handling still holds.
3. **Bump `CACHE_VERSION` in `sw.js`** (repo rule), and if you add a new JS file
   add it to `STATIC_SHELL` there too.
4. **Verify.** `node server.js` (dev server), open the app, click the star tab,
   and check: trophies on the top three distinct counts, ties sharing a trophy,
   muscle chip select/deselect, each period chip, deselecting a period returning
   to `All`, and filters surviving a refresh.

## Constraints that will bite you if ignored

- **Count days, not records.** Always dedupe by `date` with a `Set`. Summing
  record counts silently turns the leaderboard into a "most sets" board.
- **Skip unknown exercises.** `getRankedExercises()` looks each `exerciseId` up
  in `Storage.getExercises()` and drops misses — deleted exercises still have
  workout history and would otherwise crash the renderer on `exercise.name`.
- **Render exercise names with `textContent`, never `innerHTML`** (XSS; repo
  rule). `createRankingRow()` builds nodes for this reason.
- **Re-run `window.lucide.createIcons()` after rendering rows**, or the trophy
  `<i data-lucide="trophy">` placeholders stay invisible.
- **Don't refetch on filter changes.** Call `render()`; only `load()` fetches,
  and only when `_workouts` is null.
- **Keep the `Exercises` import for the muscle chips.** The circular
  `app.js ↔ exercises.js ↔ rankings.js` import is fine because usage is at
  runtime, and duplicating the chip renderer violates the repo's no-duplication
  rule.
- **4-space indent, single quotes, JSDoc on public methods** — `js/` module
  style.
