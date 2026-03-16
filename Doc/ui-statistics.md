# Statistics Tab

`statisticsSection` in `index.html`.

---

## Layout

- **KPI Grid** `#kpiGrid` — summary cards injected by JS
- **Stats Period Tabs** — three panels, one active at a time
- **Empty State** — shown when there is no workout data

---

## Period Tabs

### Weekly

- Week navigation bar — ← current week label → (next disabled when at current week)
- Sessions Per Muscle `#muscleSessionsWeek` — injected by JS
- Muscle Balance — Radar chart
- Muscle Exercise Balance — Radar chart

### Monthly

- Month navigation bar — ← current month label →
- Sessions Per Muscle `#muscleSessionsMonth` — injected by JS
- Muscle Balance — Radar chart
- Muscle Exercise Balance — Radar chart

### Overall

- **Stats Overview Grid**
  - Training Frequency — Bar chart
  - Progressive Overload section
    - Metric selector (chart controls, injected by JS)
    - Category tabs (injected by JS)
    - Category tab content — charts injected per category
- Weekly Muscle Activity — Bar chart

---

```mermaid
graph TD
    STATS["statisticsSection"]
    STATS --> KPI["KPI Grid #kpiGrid\n(cards injected by JS)"]
    STATS --> PERIOD["Stats Period Tabs"]
    STATS --> EMPTY["Empty State\n'No workout data'"]

    PERIOD --> PT_NAV["Period Tab Nav"]
    PT_NAV --> PT_WEEKLY["Weekly"]
    PT_NAV --> PT_MONTHLY["Monthly"]
    PT_NAV --> PT_OVERALL["Overall"]

    PERIOD --> PANEL_W["Weekly Panel"]
    PANEL_W --> WK_NAV["Week Nav Bar ← label →"]
    PANEL_W --> WK_MUSCLE["Sessions Per Muscle\n#muscleSessionsWeek"]
    PANEL_W --> WK_RADAR1["Muscle Balance\nRadar Chart"]
    PANEL_W --> WK_RADAR2["Muscle Exercise Balance\nRadar Chart"]

    PERIOD --> PANEL_M["Monthly Panel"]
    PANEL_M --> MO_NAV["Month Nav Bar ← label →"]
    PANEL_M --> MO_MUSCLE["Sessions Per Muscle\n#muscleSessionsMonth"]
    PANEL_M --> MO_RADAR1["Muscle Balance\nRadar Chart"]
    PANEL_M --> MO_RADAR2["Muscle Exercise Balance\nRadar Chart"]

    PERIOD --> PANEL_O["Overall Panel"]
    PANEL_O --> OV_FREQ["Training Frequency\nBar Chart"]
    PANEL_O --> OV_OVERLOAD["Progressive Overload section"]
    OV_OVERLOAD --> OV_CTRL["Metric selector\n(injected by JS)"]
    OV_OVERLOAD --> OV_CATS["Category Tabs\n(injected by JS)"]
    OV_OVERLOAD --> OV_CATCONTENT["Category Tab Content\n(charts injected by JS)"]
    PANEL_O --> OV_WEEKLY_MUSCLE["Weekly Muscle Activity\nBar Chart"]
```
