# Workout Tab — Architecture

Everything here is derived from the current source of `workout.html` and the
parent bridge in `js/app.js`. Line numbers are approximate anchors, not exact —
search by function name if they've drifted.

## How the page is mounted

`index.html` renders the Workout section as nothing more than an iframe:

```html
<section id="workoutSection" ...>
  <div id="workoutPane" class="workout-design-section active">
    <iframe src="workout.html" title="Workout" class="workout-design-frame"></iframe>
  </div>
</section>
```

So `workout.html` is a *separate document*. It loads only Lucide as an external
script; all of its logic is in two inline `<script>` blocks (≈ lines 1239 and
3039). It cannot `import` from `js/`.

`EMBED_MODE = window.self !== window.top` (≈ line 1245) distinguishes the real
embedded app from someone opening `workout.html` directly (demo mode).

Key constants (top of the inline script):
- `THEME_KEY = 'theme'`
- `SESSION_KEY = 'workout.activeSession'` — the in-progress session draft
- `DESIGN1_LAST_WORKOUT_KEY = 'workout1.lastWorkoutByExercise'` — prev-set hints

## The three tabs (plus one legacy)

The bottom `tab-bar` (≈ line 1191) drives view switching via `switchTab(tab)`
(≈ line 2243), which toggles the `.active` class on the view containers:

| Tab button | View container | Purpose |
|---|---|---|
| `#tab-plan` | `#planView` | Build the session: add/remove exercise cards, edit sets, link supersets. The default view. |
| `#tab-execute` | `#executeView` | Guided "do the workout" mode — shows one group (single card or linked superset pair) at a time with prev/next navigation. |
| `#tab-add` | (modal) | Calls `openAddExercisePicker()` to add an exercise card; not a view of its own. |
| (`#logView`) | `#logView` | **Legacy** quick single-set form, effectively unused. Don't build on it. |

### Execute mode

`executeState = { active, groups, current, cardOrder }` (≈ line 2259). On enter
(`enterExecuteMode`, ≈ 2289) it snapshots card order, builds *groups* via
`buildExecuteGroups()` (a single card, or two cards linked as a superset),
hides the add/execute tab buttons, shows back/next nav, and renders the first
incomplete group. Cards are physically moved between `#planView` and
`#executeCards` as you navigate, then moved back in original order on exit
(`exitExecuteMode`, ≈ 2312). A group is complete when every set's `.tick-btn`
is `ticked`.

## The card / set DOM model

The planner has **no central state object** — the DOM is the model. Each
exercise is a `.exercise-card`:

- `id` = `card-<key>` (the `<key>` is a generated suffix)
- `dataset.exerciseId` — the exercise's id (matches the parent's exercise list)
- `dataset.bodyweight` — `'1'` for bodyweight exercises (no weight field)
- `dataset.linkedWith` — the `id` of the adjacent card it forms a superset with
  (mutual: each points at the other). Drives superset grouping & visuals.

Inside, a card's body is `#body-<key>` and contains one `.set-row` per set:

- `.reps-input` (or `input.set-input`) — reps value/placeholder
- `.weight-input` — weight value/placeholder (absent/hidden for bodyweight)
- `.tick-btn` with class `ticked` — marks the set complete; the row also gets
  `.completed`

`tickedCount` is a running counter used by the submit button state.

## Persisted-session shape

`serializeDesign1Cards()` (≈ 1888) reads the DOM into a plain array — this is the
canonical in-memory representation when one is needed:

```js
// one element per .exercise-card
{
  exerciseId, name, muscle,
  bodyweight,            // boolean
  sets: [{
    repsValue, repsPlaceholder,
    weightValue, weightPlaceholder,
    isBodyweight,        // boolean
    ticked               // boolean (completed)
  }],
  removeable             // whether the card has a remove button
}
```

`saveDesign1State()` (≈ 1991) wraps that and also computes a `rows` array in the
**shared template/record format** (`type: 'single' | 'superset'`, each set
`{ id, reps, weight, completed }`), then writes the whole thing to
`localStorage[SESSION_KEY]`:

```js
{ cards, exercises: [exerciseId...], rows }
```

The `rows` field exists so this draft is interoperable with the template/record
format used elsewhere (and with the legacy `Workouts` reader that shares
`SESSION_KEY`). On restore, `applySavedDesign1State()` (≈ 2080) rebuilds cards
and `applyCardState(cardId, cardState)` (≈ 1919) writes each card's sets,
bodyweight mode, and tick state back into the DOM.

> ⚠️ This serialize → save → restore loop is the part most likely to break.
> Any new per-card or per-set state must be added to **all three**:
> `serializeDesign1Cards`, `saveDesign1State`'s `rows` mapping (if relevant),
> and `applyCardState`.

## Inline function index (by concern)

Search these names in `workout.html`:

**Tabs & execute mode**
`switchTab`, `enterExecuteMode`, `exitExecuteMode`, `buildExecuteGroups`,
`isGroupComplete`, `renderExecuteGroup`, `executeNav`, `executeSkip`,
`executeSubmit`, `showExecuteDone`, `checkExecuteAutoAdvance`

**Cards (add / remove / configure)**
`addExercise`, `removeExercise`, `openAddExercisePicker`, `confirmSessionPicker`,
`applyExercisePreset`, `applyExercisePresetById`, `ensureCardEquipmentIcon`,
`refreshExerciseIcons`, `updateCardWeightMode`

**Sets**
`addSet`, `tickSet`, `renumberSets`, `changeRepInput`, `enhanceRepsControls`,
`checkCardDone`, `updateSubmit`

**Supersets / linking**
`toggleLinkWithNext`, `clearExerciseLink`, `updateLinkVisuals`, `refreshLinkButtons`

**Persistence (DOM ⇄ localStorage)**
`serializeDesign1Cards`, `saveDesign1State`, `applyCardState`,
`applySavedDesign1State`, `ensureDesign1SharedStateListener`

**Templates**
`chooseTemplate`, `loadTemplate`, `setTemplateSelection`, `_mergeParentTemplates`

**Parent bridge / data in**
`_mergeParentExercises`, `_mergeParentTemplates`, `_mergeParentWorkouts`,
the `message` listener (≈ 1517), and the submit handler that posts
`po-save-workouts` (≈ 2992)

**History hints**
`getLastWorkoutMap`, `saveLastWorkoutMap`, `getLastWorkoutForExercise`,
`captureLastWorkoutFromCurrentBoard`, `showExerciseHistory`

**Misc**
`applyStoredTheme`, `toggleTheme`, `pickDate`, `getEquipmentIcon`,
`ensureExerciseMetaById`, `getExerciseMetaById`, `getExerciseIdByName`
