# Feature: Authentication & Configuration

## Purpose
Manages the public Supabase browser configuration and email magic-link session surfaced in the nav settings dropdown. Supabase is the only application data source.

## Key Files
- `js/config.js` — `CONFIG` constants, Supabase configuration check, and cache refresh action
- `js/supabase-auth.js` — email magic-link session handling
- `js/supabase-client.js` — configured browser client
- `index.html` — signed-out and signed-in settings states

## `CONFIG` Constants
```js
CONFIG.supabase         // { url, publishableKey, schema }
CONFIG.limits           // UI limits
CONFIG.toast            // toast timing
CONFIG.charts           // chart defaults and color palette
CONFIG.equipmentTypes   // equipment type definitions
CONFIG.defaultExercises // seed exercises for empty accounts
```

## Integration Points
- `App.initApp()` checks `isSupabaseConfigured()`, initializes `SupabaseAuth`, and opens settings when sign-in is required.
- `SupabaseAPI` scopes every query to `SupabaseAuth.getUserId()`.
- The settings dropdown calls `requestSupabaseMagicLink()` and `signOutSupabase()`.

## Rules & Constraints
- `CONFIG` is a module-level constant; do not mutate it at runtime.
- Only the public Supabase publishable key may be used in browser code.
- Supabase service-role credentials must never enter the browser bundle.
