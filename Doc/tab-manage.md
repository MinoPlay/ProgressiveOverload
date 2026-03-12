# Manage Tab

The **Manage** section (`#exercisesSection`) contains two sub-tabs: **Exercises** and **Templates**, toggled by buttons at the top of the section. The active sub-tab is saved in `localStorage` under `activeManageTab`.

---

## Exercises Sub-tab

Managed by `Exercises` (`js/exercises.js`). This is where the user builds and maintains their personal exercise catalogue.

### Design

- A `+` icon button (`#addExerciseBtn`) in the section header, and when the list is empty an inline placeholder, both open the Add form.
- A **filter bar** (`exercise-filter-panel`) with chip-toggle groups for **Equipment** and **Target Muscle**. Selecting a chip instantly re-renders the list using the selected filters. Filters are not persisted.
- The **exercise list** (`#exerciseList`) shows one card per exercise, sorted alphabetically.

### Exercise cards

Each card shows:
- Exercise name (heading)
- Equipment badge (coloured chip: Barbell / Dumbbell / Kettlebell / Machines / Bodyweight / Bodyweight+)
- Muscle badge

Action buttons on each card:
- **Edit** — opens the form pre-filled with the exercise's current values.
- **Delete** — shows a `confirm()` dialog, then calls `Storage.deleteExercise(id)`.

### Add / Edit form (`#exerciseForm`)

The form slides in above the list. Fields:

| Field | Input type | Notes |
|-------|-----------|-------|
| Exercise Name | Text input | Required, max 100 chars |
| Equipment Type | Chip-toggle group | Single-select; required |
| Target Muscle | Chip-toggle group | Single-select from a fixed list: chest, back, shoulders, legs, biceps, triceps, core, neck |

Hidden `<input>` elements (`#equipmentType`, `#muscle`) hold the selected values for form submission.

On submit:
1. `validateExerciseName()` and `validateEquipmentType()` check the inputs.
2. `Storage.addExercise()` (new) or `Storage.updateExercise()` (edit) is called.
3. On success: form is hidden, the list re-renders, and a `exercisesUpdated` custom event is dispatched so all workout dropdowns and iframes refresh immediately.

### Equipment types

Defined in `CONFIG.equipmentTypes` (`js/config.js`):

| Key | Label | Requires weight field? |
|-----|-------|----------------------|
| `barbell` | Barbell | Yes |
| `dumbbell` | Dumbbell | Yes |
| `kettlebell` | Kettlebell | Yes |
| `machines` | Machines | Yes |
| `bodyweight` | Bodyweight | No |
| `bodyweight+` | Bodyweight+ | Yes (added resistance, e.g. vest) |

### Muscle groups (fixed list)

`chest`, `back`, `shoulders`, `legs`, `biceps`, `triceps`, `core`, `neck`.

---

## Templates Sub-tab

Managed by `Templates` (`js/templates.js`). Templates are pre-defined session plans that can be loaded into the Workout planner with one click.

### Design

- An **Add New Template** button (`#addTemplateBtn`) at the top.
- A **template list** (`#templateList`) showing one card per saved template.
- A **template editor form** (`#templateForm`) that slides in to create or edit a template.

### Template cards

Each card shows:
- Template name
- Meta line: `N exercises · M rows`

Action buttons:
- **Edit** (pencil icon) — opens the editor pre-filled.
- **Delete** (trash icon) — calls `Storage.deleteSessionTemplate(id)` after a confirm prompt (not shown — deletion is immediate via the icon click, but `deleteTemplate()` in the module handles it).

### Template editor

The editor has:

1. **Template Name** field (`#templateName`) — required, max 100 chars.
2. **Row controls** — two icon buttons:
   - `+` (`#templateAddExerciseBtn`) — adds a new single-exercise row.
   - link icon (`#templateAddSupersetBtn`) — adds a superset block.
3. **Row list** (`#templateRowList`) — the exercise rows in order.

#### Single-exercise row

Each row contains:
- Exercise select dropdown (populated from `Storage.getExercises()`, sorted alphabetically).
- A sets grid with per-set reps and weight fields. Default set count: `DEFAULT_SET_COUNT = 3`.
- Row actions:
  - **Link** (link-2 icon) — converts this row and the one below into a superset block.
  - **Collapse** (chevron) — collapses/expands the sets grid.
  - **Remove** (trash) — deletes the row.

#### Superset block

Two (or more) exercise rows grouped together, labeled A / B. Each inner row has its own exercise dropdown and sets grid. The block has:
- **Unlink** button (active link icon) — splits the superset back into two separate single-exercise rows.
- **Collapse** and **Remove** buttons.

### Saving a template

Clicking **Save Template** (`#saveTemplateBtn`):
1. Reads `Templates.editorSession` (in-memory object representing the current editor state).
2. Validates that the name is non-empty and every row has an exercise selected.
3. Calls `Storage.addSessionTemplate()` (new) or `Storage.updateSessionTemplate()` (edit).
4. Closes the editor, re-renders the template list, and dispatches `templatesUpdated` so all iframes and the planner template dropdown refresh.

### Data structure (a template object)

```json
{
  "id": "tpl-1712345678000",
  "name": "Push Day A",
  "rows": [
    {
      "id": "tpl-row-...",
      "type": "single",
      "exerciseId": "ex-...",
      "sets": [
        { "id": "...-set-1", "reps": "8", "weight": "80" },
        { "id": "...-set-2", "reps": "8", "weight": "80" },
        { "id": "...-set-3", "reps": "8", "weight": "80" }
      ]
    },
    {
      "id": "tpl-ss-...",
      "type": "superset",
      "label": "Superset",
      "exercises": [
        { "id": "...-a", "exerciseId": "ex-...", "sets": [ ... ] },
        { "id": "...-b", "exerciseId": "ex-...", "sets": [ ... ] }
      ]
    }
  ]
}
```

Templates are stored in `data/session-templates.json` (GitHub mode) or in `DevStorage.sessionTemplates` / `dev-data.json` (local mode).
