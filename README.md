# Insight Lab prototype

This branch explores an analytics-first design aimed at surfacing patterns, trends, and progress signals at a glance.

## Concept
- Data-first browser dashboard
- Split navigation with dense KPIs
- Progressive overload trends shown before workouts
- Better for longer-term planning and review

## Design goals
- Surface insights with minimal clicks
- Let users understand volume, recovery, and 1RM progression quickly
- Balance detailed data with readable hierarchy

## Preview

```bash
cd /Users/mino/Documents/GitHub/ProgressiveOverload-insight-lab
python3 -m http.server 8002
```
Then open http://localhost:8002/

Sign in through the **Live backend** panel. The prototype reads the authenticated user's exercises and complete workout history from Supabase and derives the visible six-month chart, 30-day trends, estimated 1RM, muscle balance, streak, and weekly progress without writing data.
