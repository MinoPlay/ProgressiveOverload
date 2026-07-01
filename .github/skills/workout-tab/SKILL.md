---
name: workout-tab
description: >-
  Complete, current map of the ProgressiveOverload Workout tab — the page the
  user logs sets on. Use this skill whenever the user asks to add to, change,
  expand, refactor, fix, or understand the workout page / workout tab / session
  board / planner / Plan-Execute-Add flow, or anything about how the workout
  exercise cards, sets, supersets, rest/execute mode, or workout data
  loading/saving behave — even if they don't say the word "skill" or name a
  file. The workout UI lives in `workout.html` (a self-contained iframe), NOT in
  `js/workouts.js` (which is legacy). Reach for this skill before grepping, so
  you edit the right file and respect the iframe/postMessage boundary.
---

# Workout Tab

The Workout tab is the screen where the user plans a session, executes it set by
set, and submits it. Getting changes right here depends on one non-obvious fact:
**the live UI is `workout.html`, a standalone document embedded as an `<iframe>`
inside `index.html`.** It has its own inline JavaScript and talks to the rest of
the app only through `postMessage`. The `Workouts` singleton in `js/workouts.js`
is **legacy** — it's still imported and `init()`-ed by `js/app.js` in the parent
page, but the planner DOM it manipulates no longer exists in the parent, so
editing it will not change what the user sees. If you change `js/workouts.js`
expecting the tab to update, nothing will happen. Always edit `workout.html`.

## The mental model

Think of `workout.html` as a small, self-contained app:

- **It owns its DOM and treats the DOM as the source of truth.** There is no
  reactive state object driving the cards; the exercise cards and set rows in
  the page *are* the state. Serialization (for persistence) is derived by
  reading the DOM, and restoration writes back into the DOM.
- **It has no access to `Storage`, `js/app.js`, or any module.** The only
  external script it loads is Lucide (icons). Everything it needs (the exercise
  list, templates, prior workouts) is pushed in from the parent over the `po-*`
  postMessage protocol, and the only way it saves is by posting a message back.
- **It runs in two modes.** `EMBED_MODE = window.self !== window.top`. Embedded
  (the real app) wires up the bridge and real save path; opened standalone it's
  a demo and Submit just shows an alert. Guard real behavior behind `EMBED_MODE`.

## Where things live

| File | Role |
|---|---|
| `workout.html` | The entire live Workout tab: markup + inline `<script>` (≈ lines 1239–3037). This is what you edit. |
| `js/app.js` | Parent side of the bridge: `IframeBridge` object (≈ line 396). Handles `po-save-workouts` → `Storage.addWorkoutsBatch`, pushes data to the iframe. |
| `js/storage.js` | `Storage.addWorkoutsBatch` — the actual persistence (assigns `sequence`, ids, GitHub sync). Runs in the parent only. |
| `js/workouts.js` | **Legacy.** Ignore for tab changes unless explicitly removing dead code. |

## The change workflow

1. **Orient** before touching anything. Read `references/architecture.md` to find
   the tab/card/set structures and the exact functions involved, and
   `references/data-flow.md` to understand how the change crosses (or doesn't
   cross) the iframe boundary.
2. **Decide which side owns the change.** Pure UI/interaction (cards, sets,
   tabs, execute mode, validation, persistence of the in-progress session) →
   `workout.html`. Anything about how saved workouts are stored, or new data the
   iframe needs from the app → also touch the parent (`IframeBridge` +
   `Storage`) and the `po-*` protocol on *both* ends.
3. **Follow the recipe.** `references/making-changes.md` has step-by-step
   patterns for the common cases (add a field to a set, add a tab, add a `po-*`
   message, change persistence, add a per-card control) with the exact functions
   to update so you don't miss the serialize/restore pair.
4. **Verify.** Run the dev server (`node server.js`, port 3000), open the app,
   and exercise the change inside the iframe — including a page refresh (to
   confirm the in-progress session restores) and a real Submit (to confirm the
   save round-trips and the board clears/acknowledges).

## Constraints that will bite you if ignored

These aren't bureaucracy — each one maps to how the page actually works:

- **Keep the serialize/restore pair in sync.** Because the DOM is the source of
  truth, any new piece of per-card or per-set state must be written in
  `serializeDesign1Cards()` *and* read back in `applyCardState()` /
  `applySavedDesign1State()`, or it silently vanishes on refresh.
- **A new `po-*` message needs both ends.** Add the sender in `workout.html` and
  the handler in the parent `IframeBridge.handleMessage` (and vice-versa) — a
  message with no listener just disappears.
- **Never send secrets over the bridge.** It posts with target origin `'*'`.
  Tokens/config must stay in the parent.
- **Bodyweight exercises have no weight.** When `card.dataset.bodyweight === '1'`
  the weight field is hidden and weight is stored/sent as empty/`null` (shown as
  `BW`). Don't reintroduce a weight value for them.
- **Render user-entered text with `textContent`, never `innerHTML`** (XSS; repo
  rule).
- **Match local style.** The inline script in `workout.html` uses 2-space
  indentation and single quotes — follow the file you're in, not the repo-wide
  4-space rule for `js/` modules.
- **Don't "fix" the tab by editing `js/workouts.js`.** It won't take effect.

## Reference files

- `references/architecture.md` — the tabs, the card/set DOM model, the
  persisted-state shape, and a grouped index of the inline functions. Read this
  first when you need to locate the code for a feature.
- `references/data-flow.md` — how data is loaded, represented, persisted, and
  saved, plus the full `po-*` message table. Read this when a change involves
  data crossing the iframe boundary.
- `references/making-changes.md` — concrete recipes for the most common changes.
  Read this when you're ready to implement.
