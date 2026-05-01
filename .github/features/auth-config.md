# Feature: Authentication & Configuration

## Purpose
Manages the GitHub Personal Access Token (PAT) and repository settings (owner/repo). Configuration is stored in `localStorage` and surfaced via the nav config dropdown. GitHub is always required — if not configured, the app opens the config panel automatically.

## Key Files
- `js/auth.js` — `Auth` singleton (token CRUD)
- `js/config.js` — `CONFIG` constants, `loadConfig / saveConfig / getConfig`, mode switching

## Configuration Shape (`localStorage['app_config']`)
```js
{
  mode: 'local'|'github',
  token: string,   // GitHub PAT
  owner: string,   // GitHub username / org
  repo: string     // repository name
}
```

## `CONFIG` Constants (read-only at runtime)
```js
CONFIG.github           // { apiUrl, owner, repo, branch }
CONFIG.storage.authKey  // localStorage key for legacy token storage ('github_pat')
CONFIG.paths            // file paths for exercises, workouts, templates, stats
CONFIG.limits           // UI limits (maxExerciseNameLength, maxReps, maxWeight, etc.)
CONFIG.toast            // { duration, fadeOutDuration }
CONFIG.charts           // chart defaults and color palette
CONFIG.equipmentTypes   // equipment type definitions
CONFIG.defaultExercises // seed exercises for empty repos
```

## Key Methods
| Symbol | Description |
|---|---|
| `Auth.getToken()` | Returns PAT from config or `localStorage['github_pat']` |
| `Auth.setToken(token)` | Validate (min length 10) and store in localStorage |
| `Auth.clearToken()` | Remove PAT from localStorage |
| `Auth.isAuthenticated()` | Returns `true` if a token exists |
| `loadConfig()` | Load `app_config` from localStorage; populate UI form fields |
| `getConfig()` | Merge persisted config with in-memory state; safe to call anytime |
| `isGitHubConfigured()` | Returns `true` if token + owner + repo are all non-empty |
| `window.saveConfig()` | Read form fields, validate, persist, reload page |
| `window.setMode(mode)` | Toggle `'local'`/`'github'` mode and persist |

## Integration Points
- `GitHubAPI.getHeaders()` calls `Auth.getToken()` for every request
- `GitHubAPI.getRepoInfo()` calls `getConfig()` to read owner/repo
- `App.init()` calls `loadConfig()` then checks `isGitHubConfigured()` — opens config panel if not configured
- Config form lives in `index.html` inside the `#configNavContent` dropdown

## Rules & Constraints
- `CONFIG` is a module-level constant — do **not** mutate it at runtime.
- `getConfig()` always returns a merged copy — mutating the returned object has no effect.
- `window.saveConfig` and `window.setMode` are global functions called from inline HTML `onclick` attributes — do not rename them.
- Token is never logged or included in error messages.
- PAT must have the `repo` scope to read/write files in a private repository.
