# History Tab

`historySection` in `index.html`.

---

## Layout

- **History Container** `#historyContent`
  - **Session Card** *(one per past workout, injected by JS)*
    - Date
    - Exercise list with sets summary

```mermaid
graph TD
    HISTORY["historySection"]
    HISTORY --> HC["History Container #historyContent\n(cards injected by JS)"]
    HC --> HCARD["Session Card (× N)"]
    HCARD --> HDATE["Date"]
    HCARD --> HEXLIST["Exercise list"]
    HEXLIST --> HSETS["Sets summary per exercise"]
```
