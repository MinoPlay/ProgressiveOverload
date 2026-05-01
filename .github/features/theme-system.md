# Feature: Theme System

## Purpose
Three-way light/dark/green theme toggle. The selected theme is applied to `<html data-theme="...">` and persisted in `localStorage`. Chart.js global defaults are updated on every theme switch to keep chart colors in sync.

## Key Files
- `js/app.js` — `Theme` object (not exported; module-internal)

## Themes
| Value | Icon | Description |
|---|---|---|
| `light` | moon | Default light mode |
| `dark` | terminal | Dark mode |
| `green` | sun | Terminal green-on-black |

Cycle order: `light → dark → green → light`

## State
```js
localStorage['theme']  // 'light' | 'dark' | 'green'
document.documentElement.getAttribute('data-theme')  // same value, live
```

## Key Methods (`Theme`)
| Method | Description |
|---|---|
| `applyEarly()` | Called before DOM is ready to set `data-theme` immediately (prevents FOUC) |
| `init()` | Wire up `#themeToggleBtn`, sync icon, apply Chart.js defaults |
| `toggle()` | Advance to next theme, persist, sync icon, update Chart.js defaults, dispatch `themeChanged` |
| `_applyChartDefaults(theme)` | Update `Chart.defaults.color`, grid colors, tick colors, legend colors |
| `_syncIcon(theme)` | Update `data-lucide` attribute on `#themeToggleIcon` and call `lucide.createIcons()` |

## Custom Event
```js
window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: next } }));
```
`Charts` listens for `themeChanged` to trigger a full chart re-render.

## CSS Integration
All theme-aware styles are driven by `[data-theme="dark"]` / `[data-theme="green"]` selectors in `css/`. Do not use JavaScript to toggle classes for theming.

## Rules & Constraints
- `applyEarly()` must run **before** `DOMContentLoaded` to prevent flash of unstyled content — it is the first call in `app.js`.
- `_applyChartDefaults` must guard against `Chart` being undefined (CDN may not have loaded yet).
- Do not add new themes without updating the cycle order in `toggle()`, the `icons` map in `_syncIcon`, and the CSS.
- Theme state lives in `localStorage['theme']`; do not move it to `app_config` or any other key.
