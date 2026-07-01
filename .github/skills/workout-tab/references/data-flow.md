# Workout Tab — Data Flow (load / represent / persist / save)

Because the tab is an iframe with no module access, *every* piece of data either
originates from the DOM, lives in `localStorage`, or crosses the parent boundary
via `postMessage`. Knowing which is which tells you where to make a change.

## 1. Represent (in the page)

The DOM is the source of truth. Exercise cards and set rows hold the live state;
there is no separate reactive store. When code needs a plain-object snapshot it
calls `serializeDesign1Cards()` (see `architecture.md` for the shape). UI updates
are made by directly manipulating cards/rows and then calling `saveDesign1State()`
to persist the new snapshot.

## 2. Persist the in-progress session (localStorage)

- **Key:** `localStorage['workout.activeSession']` (`SESSION_KEY`).
- **Write:** `saveDesign1State()` — called after meaningful edits (add/remove
  card, edit set, tick, link). Stores `{ cards, exercises, rows }`.
- **Read/restore:** `applySavedDesign1State()` rebuilds the board on load (and
  re-runs when `po-exercises` arrives, since exercise metadata is needed to
  render cards). `applyCardState()` restores each card.
- **Why it matters:** a page refresh must restore the exact in-progress session,
  including ticked sets. This is also why the `storage` event is listened to —
  edits in another context can update the board.

Other keys:
- `localStorage['workout1.lastWorkoutByExercise']` (`DESIGN1_LAST_WORKOUT_KEY`) —
  cached "previous set" hints per exercise, refreshed after a successful save.
- `localStorage['theme']` (`THEME_KEY`) — theme, kept in sync via the `storage`
  event so the iframe matches the parent.

## 3. Load reference data (parent → iframe)

On load (when `EMBED_MODE`), the iframe asks the parent for what it needs:

```js
window.parent.postMessage({ type: 'po-request-exercises' }, '*');
window.parent.postMessage({ type: 'po-request-templates' }, '*');
window.parent.postMessage({ type: 'po-request-workouts' }, '*');
```

The parent (`IframeBridge` in `js/app.js`) responds — and also pushes
proactively after `Storage` initializes and whenever exercises/templates change.
The iframe's `message` listener routes them:

| Incoming `po-*` | Handler in `workout.html` | Effect |
|---|---|---|
| `po-exercises` | `_mergeParentExercises` | Fills `EXERCISE_META_BY_ID` + `EXERCISE_PRESETS` (name, muscle, equipment, default reps/weight from last set, bodyweight flag); then re-applies saved state. Parent data is authoritative. |
| `po-templates` | `_mergeParentTemplates` | Builds selectable session templates (resolves exercise ids → names/sets). |
| `po-workouts` | `_mergeParentWorkouts` | Supplies prior workouts (current month) for last-set hints and the per-exercise volume bars. |
| `po-history-workouts` | `_mergeParentWorkouts` | Supplies a broader window of prior workouts (last 12 months) so volume bars and reps/weight preload reflect sessions from earlier months. Merged (deduped by id) with `po-workouts`. |
| `po-workouts-saved` | (inline) | Save acknowledged: show "Saved ✓", capture last-workout snapshot, optionally clear the board, leave execute mode. |
| `po-save-error` | (inline) | Re-enable submit, alert the error. |

## 4. Save the session (iframe → parent → Storage)

The Submit button handler (≈ line 2992) and execute-mode submit collect **only
ticked sets** into a minimal payload:

```js
workouts.push({ exerciseId, date, reps, weight }); // weight null for bodyweight
window.parent.postMessage({ type: 'po-save-workouts', workouts }, '*');
```

The parent handles it in `IframeBridge.handleMessage` (≈ line 481):

```js
case 'po-save-workouts':
  Storage.addWorkoutsBatch(msg.workouts)        // assigns sequence, id, persists, GitHub sync
    .then(() => { /* post po-workouts-saved */ this.broadcastWorkouts(); })
    .catch(() => { /* post po-save-error */ });
```

So the iframe sends a *thin* record; the parent's `Storage.addWorkoutsBatch`
enriches it (notably `sequence` ordering within a day, ids, and any sync). The
iframe never writes workout history directly — `po-save-workouts` is the **only
write path**.

## Full `po-*` message protocol

### Parent → iframe (push)
| `type` | Payload | Meaning |
|---|---|---|
| `po-exercises` | `{ exercises: Exercise[] }` | Full exercise list (authoritative) |
| `po-templates` | `{ templates: SessionTemplate[] }` | Full template list |
| `po-workouts` | `{ workouts: WorkoutRecord[] }` | Current month's workouts (for hints + volume bars) |
| `po-history-workouts` | `{ workouts: WorkoutRecord[] }` | Last 12 months of workouts — used for the per-exercise volume bars and to preload reps/weight from earlier-month sessions |
| `po-week-workouts` | `{ workouts: WorkoutRecord[] }` | Current calendar week's workouts (Mon–Sun, may span months) — used for the top-of-tab weekly muscle balance radar |
| `po-workouts-saved` | — | Save succeeded |
| `po-save-error` | `{ error }` | Save failed |

### Iframe → parent (request / action)
| `type` | Payload | Meaning |
|---|---|---|
| `po-request-exercises` | — | Please send exercises |
| `po-request-templates` | — | Please send templates |
| `po-request-workouts` | — | Please send workouts |
| `po-request-history-workouts` | — | Please send the last 12 months of workouts |
| `po-request-week-workouts` | — | Please send the current week's workouts |
| `po-save-workouts` | `{ workouts: {exerciseId,date,reps,weight}[] }` | Save these ticked sets |

### Rules
- Only `type`s starting with `po-` are processed; the parent also verifies the
  message came from a known iframe (`event.source`).
- Target origin is `'*'` — **never** send tokens/config/secrets over it.
- Adding a new message type means editing **both** ends, or it's a no-op.
