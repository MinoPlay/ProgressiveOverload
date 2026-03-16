# Manage Tab

`exercisesSection` in `index.html`. Contains two sub-tabs.

---

## Sub-Tab Nav

| Tab | Pane |
|---|---|
| Exercises | `#manageExercisesPane` |
| Templates | `#manageTemplatesPane` |

---

## Exercises Pane

- Add Exercise button
- **Add / Edit Exercise Form** *(hidden by default)*
  - Exercise Name input
  - Equipment Type — toggle chip grid
  - Target Muscle — toggle chip grid
  - Save · Cancel buttons
- **Filter Panel**
  - Equipment filter chips
  - Target muscle filter chips
- **Exercise List** `#exerciseList` — items injected by JS

---

## Templates Pane

- Add New Template button
- **Template List** `#templateList` — items injected by JS
- **Add / Edit Template Form** *(hidden by default)*
  - Template Name input
  - Add Exercise button
  - Add Superset button
  - Template Row List `#templateRowList` — rows injected by JS
  - Save · Cancel buttons

---

```mermaid
graph TD
    MANAGE["exercisesSection (Manage)"]

    MANAGE --> SUBTABS["Sub Tab Nav"]
    SUBTABS --> ST_EX["Exercises tab"]
    SUBTABS --> ST_TMPL["Templates tab"]

    MANAGE --> PANE_EX["Exercises Pane #manageExercisesPane"]
    PANE_EX --> EX_ADDBTN["Add Exercise btn"]
    PANE_EX --> EX_FORM["Add/Edit Exercise Form\n(hidden by default)"]
    EX_FORM --> EXF_NAME["Exercise Name input"]
    EX_FORM --> EXF_EQUIP["Equipment Type\ntoggle chips"]
    EX_FORM --> EXF_MUSCLE["Target Muscle\ntoggle chips"]
    EX_FORM --> EXF_ACTIONS["Save · Cancel btns"]
    PANE_EX --> EX_FILTER["Filter Panel"]
    EX_FILTER --> EXF_FEQUIP["Equipment filter chips"]
    EX_FILTER --> EXF_FMUSCLE["Muscle filter chips"]
    PANE_EX --> EX_LIST["Exercise List #exerciseList\n(items injected by JS)"]

    MANAGE --> PANE_TMPL["Templates Pane #manageTemplatesPane"]
    PANE_TMPL --> TM_ADDBTN["Add New Template btn"]
    PANE_TMPL --> TM_LIST["Template List #templateList\n(items injected by JS)"]
    PANE_TMPL --> TM_FORM["Add/Edit Template Form\n(hidden by default)"]
    TM_FORM --> TMF_NAME["Template Name input"]
    TM_FORM --> TMF_ADDEX["Add Exercise btn"]
    TM_FORM --> TMF_ADDSS["Add Superset btn"]
    TM_FORM --> TMF_ROWS["Template Row List #templateRowList\n(rows injected by JS)"]
    TM_FORM --> TMF_ACTIONS["Save · Cancel btns"]
```
