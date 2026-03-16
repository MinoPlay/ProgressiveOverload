# UI Structure

Single-page app (`index.html`). A top-nav dropdown switches between four main sections. Each section is documented in its own file below.

## Sections

- [Workout](ui-workout.md) — active session board (embedded `workout.html`)
- [History](ui-history.md) — past session cards
- [Statistics](ui-statistics.md) — KPI grid and period-based charts
- [Manage](ui-manage.md) — exercise list and workout templates

---

## Top-Level Shell

- **Header** `.app-header`
  - Theme toggle button
  - Main nav dropdown
    - Workout
    - History
    - Statistics
    - Manage
    - Configuration *(collapsible)*
      - Mode toggle: Local | GitHub
      - GitHub config form: Token · Username · Repo · Save
      - Local controls: Sample Data · Clear Data
- **Main** `.app-content`
  - `workoutSection`
  - `historySection`
  - `statisticsSection`
  - `exercisesSection` (Manage)

---

## Global Modals

- **Save As Template** `#saveAsTemplateModal`
  - Template Name input
  - Save · Cancel buttons

```mermaid
graph TD
    WORKOUT["workoutSection\n(iframe → workout.html)"]

    WORKOUT --> WH["Header .app-header\nhidden in embedded mode"]
    WH --> WH_DATE["Date pill (date picker)"]
    WH --> WH_THEME["Theme toggle btn"]
    WH --> WH_SETTINGS["Settings btn"]

    WORKOUT --> TMPL["Template Picker\ndropdown"]

    WORKOUT --> SCROLL["Scroll Area"]

    SCROLL --> PLANVIEW["Plan View #planView\n(default active)"]
    SCROLL --> LOGVIEW["Log View #logView"]

    PLANVIEW --> EXCARD["Exercise Card (× N)"]
    EXCARD --> CARDHEADER["Card Header\nExercise name · Link btn · Collapse btn"]
    EXCARD --> SETSBODY["Sets Body"]
    SETSBODY --> SETHDR["Set Header Row\n# · Reps · Weight · ✓"]
    SETSBODY --> SETROW["Set Row (× N)\n# · Reps input · Weight input · Tick btn"]
    SETSBODY --> PREVHINT["Prev Session Hint\n(last session data)"]
    SETSBODY --> ADDSET["Add Set btn"]
    EXCARD --> CARDSUMMARY["Card Summary\n(set tags after tick)"]

    LOGVIEW --> LOGCARD["Log Card"]
    LOGCARD --> LC_MUSCLE["Muscle Group select"]
    LOGCARD --> LC_EX["Exercise select"]
    LOGCARD --> LC_PREV["Prev Hint\n(last: reps × weight)"]
    LOGCARD --> LC_REPS["Reps stepper input"]
    LOGCARD --> LC_WEIGHT["Weight input"]
    LOGCARD --> LC_BTN["Log Set btn"]

    WORKOUT --> TABBAR["Bottom Tab Bar .tab-bar"]
    TABBAR --> TB_PLAN["Plan tab\n(switchTab plan)"]
    TABBAR --> TB_ADD["Add Exercise btn\n(opens picker modal)"]
    TABBAR --> TB_SUBMIT["Submit Slot\nClear checkbox · Submit Session btn"]

    WORKOUT --> MOD_PICKER["Session Exercise Picker Modal"]
    MOD_PICKER --> SPM_SEL["Exercise select"]
    MOD_PICKER --> SPM_ACT["Cancel · Confirm btns"]

    WORKOUT --> MOD_HIST["Exercise History Modal"]
    MOD_HIST --> HM_LIST["Sessions list\n(date + set tags)"]
    MOD_HIST --> HM_CLOSE["Close btn"]
```

---

## History Tab (`historySection`)

```mermaid
graph TD
    HISTORY["historySection"]
    HISTORY --> HC["History Container #historyContent\n(cards injected by JS)"]
    HC --> HCARD["Session Card (× N)\n(date, exercises, sets summary)"]
```

---

## Statistics Tab (`statisticsSection`)

```mermaid
graph TD
    STATS["statisticsSection"]

    STATS --> KPI["KPI Grid #kpiGrid\n(cards injected by JS)"]
    STATS --> PERIOD["Stats Period Tabs #statsPeriodTabs"]
    STATS --> EMPTY["Empty State\n'No workout data'"]

    PERIOD --> PT_NAV["Period Tab Nav"]
    PT_NAV --> PT_WEEKLY["Weekly btn"]
    PT_NAV --> PT_MONTHLY["Monthly btn"]
    PT_NAV --> PT_OVERALL["Overall btn"]

    PERIOD --> PANEL_W["Weekly Panel #statsPanelWeekly"]
    PANEL_W --> WK_NAV["Week Nav Bar\n← label →"]
    PANEL_W --> WK_MUSCLE["Sessions Per Muscle #muscleSessionsWeek\n(injected by JS)"]
    PANEL_W --> WK_RADAR1["Muscle Balance\nRadar Chart #muscleRadarWeekChart"]
    PANEL_W --> WK_RADAR2["Muscle Exercise Balance\nRadar Chart #muscleRadarWeekExerciseChart"]

    PERIOD --> PANEL_M["Monthly Panel #statsPanelMonthly"]
    PANEL_M --> MO_NAV["Month Nav Bar\n← label →"]
    PANEL_M --> MO_MUSCLE["Sessions Per Muscle #muscleSessionsMonth\n(injected by JS)"]
    PANEL_M --> MO_RADAR1["Muscle Balance\nRadar Chart #muscleRadarMonthChart"]
    PANEL_M --> MO_RADAR2["Muscle Exercise Balance\nRadar Chart #muscleRadarMonthExerciseChart"]

    PERIOD --> PANEL_O["Overall Panel #statsPanelOverall"]
    PANEL_O --> OV_GRID["Stats Overview Grid"]
    OV_GRID --> OV_FREQ["Training Frequency\nBar Chart #weeklyFrequencyChart"]
    OV_GRID --> OV_OVERLOAD["Progressive Overload section"]
    OV_OVERLOAD --> OV_CTRL["Chart Controls\n(metric selector injected)"]
    OV_OVERLOAD --> OV_CATS["Category Tabs #categoryTabs\n(tabs injected by JS)"]
    OV_OVERLOAD --> OV_CATCONTENT["Category Tab Content #categoryTabContent\n(charts injected by JS)"]
    PANEL_O --> OV_WEEKLY_MUSCLE["Weekly Muscle Activity\nBar Chart #weeklyMuscleChart"]
```

---

## Manage Tab (`exercisesSection`)

```mermaid
graph TD
    MANAGE["exercisesSection (Manage)"]

    MANAGE --> SUBTABS["Sub Tab Nav"]
    SUBTABS --> ST_EX["Exercises tab\n#manageTabExercises"]
    SUBTABS --> ST_TMPL["Templates tab\n#manageTabTemplates"]

    MANAGE --> PANE_EX["Exercises Pane #manageExercisesPane"]
    PANE_EX --> EX_ADDBTN["Add Exercise btn"]
    PANE_EX --> EX_FORM["Add/Edit Exercise Form\n(hidden by default)"]
    EX_FORM --> EXF_NAME["Exercise Name input"]
    EX_FORM --> EXF_EQUIP["Equipment Type\ntoggle chips"]
    EX_FORM --> EXF_MUSCLE["Target Muscle\ntoggle chips"]
    EX_FORM --> EXF_ACTIONS["Save · Cancel btns"]
    PANE_EX --> EX_FILTER["Filter Panel"]
    EX_FILTER --> EXF_FEQUIP["Equipment Filter chips"]
    EX_FILTER --> EXF_FMUSCLE["Muscle Filter chips"]
    PANE_EX --> EX_LIST["Exercise List #exerciseList\n(items injected by JS)"]

    MANAGE --> PANE_TMPL["Templates Pane #manageTemplatesPane"]
    PANE_TMPL --> TM_ADDBTN["Add New Template btn"]
    PANE_TMPL --> TM_LIST["Template List #templateList\n(items injected by JS)"]
    PANE_TMPL --> TM_FORM["Add/Edit Template Form\n(hidden by default)"]
    TM_FORM --> TMF_NAME["Template Name input"]
    TM_FORM --> TMF_ADDEX["Add Exercise btn"]
    TM_FORM --> TMF_ADDSS["Add Superset btn"]
    TM_FORM --> TMF_ROWS["Template Row List\n#templateRowList"]
    TM_FORM --> TMF_ACTIONS["Save · Cancel btns"]
```

---

## Global Modals (index.html)

```mermaid
graph TD
    MODALS["Global Modals"]
    MODALS --> SATM["Save As Template Modal\n#saveAsTemplateModal"]
    SATM --> SATM_INPUT["Template Name input"]
    SATM --> SATM_ACTIONS["Save · Cancel btns"]
```
