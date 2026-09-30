# Compact Coach prototype

This branch explores a quick-log, low-friction workout dashboard designed for daily training rhythm.

## Concept
- Faster than the main app
- Big call-to-action buttons
- Session-first layout
- Less clutter, more momentum

## Design goals
- Reduce cognitive load during a workout
- Highlight the next action rather than every metric
- Make a single workout feel like a guided flow

## Preview

```bash
cd /Users/mino/Documents/GitHub/ProgressiveOverload-compact-coach
python3 -m http.server 8001
```
Then open http://localhost:8001/

Sign in through the **Live backend** panel. The prototype reads the authenticated user's exercises and complete workout history from Supabase and derives the visible latest session, 30-day metrics, training highlights, and weekly progress without writing data.
