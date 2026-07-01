# Workout Tab — Making Changes (recipes)

Each recipe lists the exact functions/locations to touch. They assume you've
read `architecture.md` and `data-flow.md`. Edit `workout.html` unless a recipe
says otherwise. Match the file's 2-space / single-quote style.

General rule of thumb: **does the change need data the iframe doesn't already
have, or does it change how saved history is stored?** If yes, you'll touch the
parent (`IframeBridge` in `js/app.js`) and/or `Storage` and the `po-*` protocol.
If no, it's purely inside `workout.html`.

---

## Recipe: add per-set or per-card state (the most common — and most error-prone)

Example: a per-set RPE field, a per-card note, a "warmup" flag.

Because the DOM is the source of truth, new state must survive the
serialize → save → restore loop or it disappears on refresh.

1. **Render it** where the set row / card is built (find where `.set-row` /
   `.exercise-card` markup is created, near `addSet` / `addExercise`).
2. **Serialize it** in `serializeDesign1Cards()` — add the field to the returned
   set/card object (read from the DOM input).
3. **Include it in `rows`** in `saveDesign1State()` if it should be part of the
   shared/template record format.
4. **Restore it** in `applyCardState()` (and `applySavedDesign1State()` if it's
   card-level) — write the saved value back into the DOM.
5. **Persist on change** — make sure the field's input triggers `saveDesign1State()`.
6. If it should be saved to workout history, also add it to the submit payload
   (see the submit recipe) — otherwise it stays a planner-only field.

✅ Verify with a refresh: the value must reappear exactly, including after
ticking the set.

---

## Recipe: change what gets saved to history

Example: include RPE or a per-set note in the saved workout record.

1. **Iframe:** in the single Submit handler (the `#submitBtn` click listener,
   ≈ line 2992), add the field to the pushed object:
   `workouts.push({ exerciseId, date, reps, weight, rpe })`. Execute mode's
   `executeSubmit()` just clicks `#submitBtn`, so there's only this one place.
2. **Parent:** in `IframeBridge.handleMessage` → `Storage.addWorkoutsBatch`
   (`js/app.js` ≈ 481, `js/storage.js`), make sure the new field is carried
   through and persisted (and synced). `Storage` assigns `sequence`/`id`; don't
   set those in the iframe.
3. Keep bodyweight handling intact — `weight` stays `null` when
   `card.dataset.bodyweight === '1'`.

---

## Recipe: add a new tab / view

1. Add the view container (e.g. `#myView`) in the markup and a `#tab-my` button
   in the `tab-bar` (≈ line 1191) that calls `switchTab('my')`.
2. Extend `switchTab(tab)` (≈ 2243) to toggle `.active` on `#myView` and the
   tab button, and to exit execute mode if needed (mirror the existing toggles).
3. If the tab is a transient action (like Add), don't add a view — call a
   function directly from the button (`openAddExercisePicker()` is the model).
4. Remember execute mode hides `#tab-add`/`#tab-execute`; if your tab should
   also hide/show during execute, update `enterExecuteMode`/`exitExecuteMode`.

---

## Recipe: add a new `po-*` message (new data from the app)

Example: the iframe needs the user's bodyweight, or unit preference.

1. **Parent sender** — add a `broadcastX()` / response in `IframeBridge`
   (`js/app.js`) and send `{ type: 'po-x', ... }`. Wire it where the other
   broadcasts happen (after `Storage` init, and on the relevant `*Updated`
   event).
2. **Parent request handler** — if the iframe will request it, handle
   `po-request-x` in `IframeBridge.handleMessage`.
3. **Iframe listener** — add an `else if (msg.type === 'po-x')` branch in the
   `message` listener (≈ 1517) and a `po-request-x` post on load (≈ 1554).
4. Never put secrets in the payload (origin is `'*'`).

A message added on only one side silently does nothing — always do both.

---

## Recipe: add a per-card control (e.g. duplicate, reorder, rest timer)

1. Add the button to the card markup (near where `addExercise` builds a card)
   and a Lucide icon; call `ensureCardEquipmentIcon` / `lucide.createIcons()` as
   needed so icons render.
2. Implement the handler operating on the card by `id` / `dataset`. Reuse
   existing helpers: `getWorkoutExerciseIds`, `hasExerciseInWorkout`,
   `updateLinkVisuals`, `renumberSets`, `checkCardDone`.
3. Call `saveDesign1State()` after the mutation so it persists.
4. If it affects superset linking, update `dataset.linkedWith` on **both** cards
   and call `updateLinkVisuals()` / `refreshLinkButtons()`.

---

## Recipe: refactor safely

The inline script is large and DOM-coupled. To reduce risk:

- Change one concern at a time (e.g. just the set-row rendering) and verify the
  full loop (render → tick → refresh-restore → submit) after each step.
- Keep `serializeDesign1Cards` ↔ `applyCardState` symmetric — they're a pair;
  changing one without the other breaks persistence.
- Don't migrate logic into `js/workouts.js` thinking it'll run — it won't drive
  the tab. If you want shared code, it still has to live in (or be inlined into)
  `workout.html`, since the iframe can't import modules.
- Preserve `EMBED_MODE` guards so standalone demo mode keeps working.

---

## Gotchas checklist

- [ ] Edited `workout.html`, not `js/workouts.js`.
- [ ] New state added to **both** serialize and restore.
- [ ] New `po-*` message handled on **both** ends.
- [ ] Bodyweight cards still send `weight: null` and show `BW`.
- [ ] User text rendered with `textContent`, not `innerHTML`.
- [ ] `saveDesign1State()` called after mutations.
- [ ] Verified: refresh restores the in-progress session; Submit round-trips
      (`po-workouts-saved`) and clears/acknowledges.

## Verifying

```bash
node server.js        # serves on http://localhost:3000
```

Open the app, work inside the Workout iframe, and test: edit sets, tick them,
refresh the page (session should restore), link a superset, run execute mode,
and submit (board should acknowledge and, if "clear after submit" is on, reset).
