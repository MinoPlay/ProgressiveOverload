# Feature: Session Templates

## Purpose
Saved workout blueprints that can be loaded into the Workout Planner. Templates define exercises and default set counts but not specific reps/weights. Managed in the **Manage → Templates** tab.

## Key Files
- `js/templates.js` — `Templates` singleton
- `js/storage.js` — `Storage.getSessionTemplates / addSessionTemplate / updateSessionTemplate / deleteSessionTemplate`
- `progressive-overload/session-templates.json` — persisted on GitHub

## Data Model

### SessionTemplate
```js
{
  id: string,       // generateId()
  name: string,
  rows: TemplateRow[]
}
```

### TemplateRow
```js
{
  rowId: string,
  exerciseId: string,
  exerciseName: string,   // denormalized for display
  setCount: number,       // default 3 (DEFAULT_SET_COUNT)
  supersetGroupId?: string
}
```

## Key Methods (`Templates`)
| Method | Description |
|---|---|
| `init()` | Bind events, render template list |
| `renderTemplateList()` | Render all templates in `#templateList` |
| `openTemplateEditor(template?)` | Open inline editor; omit argument for new template |
| `closeTemplateEditor()` | Reset `editorSession` and hide editor |
| `saveTemplate()` | Validate, call `Storage.addSessionTemplate` or `updateSessionTemplate` |
| `addEditorExercise()` | Append a new exercise row to the editor |
| `addEditorSuperset()` | Append a superset pair row |
| `handleEditorFieldChange(e)` | Update `editorSession.rows` on field change |
| `handleEditorAction(e)` | Dispatch clicks (delete row, move up/down) |

## Integration Points
- **Storage** — `getSessionTemplates()`, `addSessionTemplate()`, `updateSessionTemplate()`, `deleteSessionTemplate()`
- **Workouts** — `Workouts.loadTemplateIntoPlanner(id)` reads from `Storage.getSessionTemplates()` and replaces the current planner session
- **Events dispatched** — `templatesUpdated` after any CRUD operation
- **Exercises** — template rows store `exerciseId`; `exerciseName` is denormalized at save time

## Rules & Constraints
- Template names must be non-empty and unique (case-sensitive check is sufficient).
- `setCount` must be a positive integer; default is `DEFAULT_SET_COUNT = 3`.
- Loading a template into the planner **replaces** the current session (no merge).
- `supersetGroupId` ties two consecutive rows together; both rows must share the same group ID.
- Templates are stored as a flat JSON array — order in the array reflects display order.
