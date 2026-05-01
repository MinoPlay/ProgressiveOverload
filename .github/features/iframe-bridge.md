# Feature: IframeBridge

## Purpose
Bidirectional `postMessage` channel between `index.html` (parent) and the `workout.html` iframe (`#workoutPane iframe`). Allows the workout iframe to receive exercises, templates, and workouts from `Storage`, and to save workouts back through the parent.

## Key Files
- `js/app.js` — `IframeBridge` object (not exported; module-internal)

## Message Protocol
All messages use `{ type: 'po-*', ...payload }`.

### Parent → Iframe (push)
| `type` | Payload | Description |
|---|---|---|
| `po-exercises` | `{ exercises: Exercise[] }` | Full exercise list |
| `po-templates` | `{ templates: SessionTemplate[] }` | Full template list |
| `po-workouts` | `{ workouts: WorkoutRecord[] }` | Current month workouts |
| `po-workouts-saved` | — | Acknowledgement after successful save |
| `po-save-error` | `{ error: string }` | Error after failed save |

### Iframe → Parent (request/action)
| `type` | Payload | Description |
|---|---|---|
| `po-request-exercises` | — | Request exercise list |
| `po-request-templates` | — | Request template list |
| `po-request-workouts` | — | Request current month workouts |
| `po-save-workouts` | `{ workouts: WorkoutRecord[] }` | Save batch of new workouts |

## Lifecycle
1. `IframeBridge.init()` — called from `App.initApp()` after `Storage.initialize()`
2. After a 100 ms delay, `broadcastExercises()`, `broadcastTemplates()`, `broadcastWorkouts()` are called
3. Each iframe's `load` event triggers `sendAllData(frame)` to handle re-loads
4. Parent listens for `exercisesUpdated` / `templatesUpdated` window events and re-broadcasts

## Key Methods (`IframeBridge`)
| Method | Description |
|---|---|
| `init()` | Find iframe(s), attach message listener and load listener |
| `sendAllData(frame)` | Send exercises + templates + workouts to a specific frame |
| `broadcastExercises()` | Send exercises to all registered frames |
| `broadcastTemplates()` | Send templates to all registered frames |
| `broadcastWorkouts()` | Send workouts to all registered frames |
| `handleMessage(event)` | Route incoming `po-*` messages; only processes messages from known frames |

## Rules & Constraints
- Only messages with `type` starting with `'po-'` are processed — all others are silently ignored.
- Messages are only processed from iframes whose `contentWindow` matches `event.source` — unknown sources are ignored.
- `po-save-workouts` is the **only write path** from the iframe; it calls `Storage.addWorkoutsBatch` and on success dispatches `workoutsUpdated`.
- The bridge uses `'*'` as the target origin for `postMessage` — do not send sensitive data (tokens, config) through this channel.
- Do not add new message types without updating both the parent handler (`handleMessage`) and the iframe sender.
