# Feature: Exercise Management

## Purpose
CRUD operations for the exercise library. Lives in the **Manage** tab. Exercises are shared across Workouts, Templates, History, and Charts.

## Key Files
- `js/exercises.js` — `Exercises` singleton

## Data Model

### Exercise
```js
{
  id: string,             // generateId() — do not change after creation
  name: string,           // unique, max 100 chars (CONFIG.limits.maxExerciseNameLength)
  equipmentType: string,  // see Equipment Types below
  muscle: string,         // see Muscle Groups below
  requiresWeight: boolean // derived from equipmentType via CONFIG.equipmentTypes
}
```

### Equipment Types (`CONFIG.equipmentTypes`)
| Value | Label | requiresWeight |
|---|---|---|
| `barbell` | Barbell | true |
| `dumbbell` | Dumbbell | true |
| `kettlebell` | Kettlebell | true |
| `machines` | Machines | true |
| `bodyweight` | Bodyweight | false |
| `bodyweight+` | Bodyweight+ | true |

### Muscle Groups
`chest` · `back` · `shoulders` · `legs` · `biceps` · `triceps` · `core` · `neck`

## Key Methods (`Exercises`)
| Method | Description |
|---|---|
| `init()` | Bind events, render toggle groups, restore active manage tab, render list |
| `render()` | Re-render `#exerciseList` with current filter state |
| `showForm(exercise?)` | Open add/edit modal dialog (`#exerciseForm`); pass exercise object to edit, omit to add |
| `hideForm()` | Close and reset modal |
| `handleSubmit(e)` | Validate fields, call `Storage.addExercise` or `Storage.updateExercise` |
| `handleDelete(id)` | Confirm then call `Storage.deleteExercise` |
| `renderIconChipButtons(containerId, options, getIcon, selected, onSelect)` | Render icon-only chip buttons (used by both the add/edit form and the list filters) |
| `setManageView(view)` | Switch between `'exercises'` and `'templates'` panes; also relabels the shared `#manageAddBtn` |

## Integration Points
- **Storage** — reads `getExercises()`, writes via `addExercise / updateExercise / deleteExercise`
- **Events dispatched** — `window.dispatchEvent(new CustomEvent('exercisesUpdated'))` after any CRUD operation
- **Workouts / Templates** — listen for `exercisesUpdated` to refresh their dropdowns

## Rules & Constraints
- Exercise names are case-insensitively unique — enforce before saving.
- `requiresWeight` is always derived from `CONFIG.equipmentTypes[equipmentType].requiresWeight`; never set it manually.
- Equipment type and muscle are selected via icon-only chip buttons (not a `<select>`); the hidden `<input>` holds the value.
- The add/edit form (`#exerciseForm`) is a modal dialog (`.modal`/`.modal-content`), opened via the shared `#manageAddBtn` next to the Exercises/Templates tabs; clicking the backdrop or Cancel closes it.
- Do not render exercise names via `innerHTML` — use `textContent` to prevent XSS.
- Deleting an exercise does not remove historical workout records referencing its ID.
