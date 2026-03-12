# Progressive Overload Tracker — Overview

A single-page fitness tracker for logging sets, tracking progressive overload, and analysing training history. Built with **vanilla JavaScript (ES Modules)**, no front-end framework.

---

## Application Structure

```
index.html          ← shell: navigation, section containers, modal dialogs
workout-v1.html     ← Workout v1 iframe (classic form-based logger)
session-board.html  ← Workout v2 iframe (mobile-style session board)
workout-builder.html← Workout v3 iframe (drag-and-drop workout planner UI)

js/
  app.js            ← entry point, theme, navigation, iframe bridge
  auth.js           ← GitHub PAT management
  config.js         ← runtime config, mode switching, localStorage helpers
  storage.js        ← data layer (GitHub API backend)
  dev-storage.js    ← data layer (local dev-data.json backend)
  github-api.js     ← GitHub REST API v3 wrapper
  exercises.js      ← Manage → Exercises UI
  templates.js      ← Manage → Templates UI
  workouts.js       ← Workout tab (v1 planner in index.html)
  history.js        ← History tab
  charts.js         ← Statistics tab
  chart-helpers.js  ← regression, 1RM, aggregation utilities
  templates.js      ← session template CRUD
  utils.js          ← shared helpers (dates, ids, validation)

css/
  layout.css        ← grid, spacing, structure
  components.css    ← buttons, cards, forms, chips
  styles.css        ← root variables, theme overrides, imports

data/
  exercises.json    ← default exercise list (seeded into GitHub on first run)
  dev-data.json     ← local development data (exercises + workouts + templates)

server.js           ← Node.js dev server (port 3000)
```

---

## Navigation

Navigation is a **dropdown menu** triggered from the header (`#mainNavTrigger`). Selecting a menu item shows the corresponding `<section>` and hides all others.

| Menu Item     | Section shown           |
|---------------|-------------------------|
| Workout       | `#workoutSection`       |
| History       | `#historySection`       |
| Statistics    | `#statisticsSection`    |
| Manage        | `#exercisesSection`     |
| Configuration | Inline panel (no navigation) |

The active section label appears next to the hamburger icon in the header.

---

## Theme

A sun/moon icon button in the header toggles between **light** and **dark** themes. The choice is saved in `localStorage` under the key `theme`. The theme is applied early (before first paint) to avoid a flash of unstyled content. All three iframes receive the active theme via the `IframeBridge` postMessage channel.

---

## Iframe Bridge

The three Workout sub-views (v1/v2/v3) are loaded in `<iframe>` elements. Because they are same-origin, the parent page communicates with them via `postMessage`. `IframeBridge` (in `app.js`) broadcasts:

- `exercises` — full exercise list whenever exercises change.
- `templates` — full template list whenever templates change.
- `workouts` — current-month workouts whenever they change.

Iframes post back a `workoutsUpdated` message when a session is saved, which causes the parent to refresh History and Statistics.

---

## Data Files (GitHub mode)

| Purpose | Path in repo |
|---------|-------------|
| Exercise definitions | `data/exercises.json` |
| Monthly workouts | `data/workouts-YYYY-MM.json` |
| Session templates | `data/session-templates.json` |

See [configuration.md](configuration.md) for details on how these are read/written.
