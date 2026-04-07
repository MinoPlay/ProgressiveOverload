#!/usr/bin/env python3
"""
Backfill lastSets and lastDate on exercises.json from historic workout files.

Usage:
    python backfill-last-sets.py [data_dir]

    data_dir  Path to folder containing exercises.json and workouts-YYYY-MM.json files.
              Defaults to ./data
"""

import json
import sys
from pathlib import Path


def load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def main():
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "data"

    exercises_path = data_dir / "exercises.json"
    if not exercises_path.exists():
        print(f"ERROR: exercises.json not found in {data_dir}")
        sys.exit(1)

    # Collect all workouts-YYYY-MM.json files, sorted oldest → newest
    workout_files = sorted(data_dir.glob("workouts-*.json"))
    if not workout_files:
        print(f"No workouts-*.json files found in {data_dir}")
        sys.exit(0)

    print(f"Found {len(workout_files)} workout file(s): {[f.name for f in workout_files]}")

    # Build a map: exerciseId -> { date -> [records sorted by sequence] }
    # We want the most recent date per exercise, with all its sets in order.
    # key: exerciseId, value: (best_date, [sets])
    best: dict[str, tuple[str, list]] = {}

    for wf in workout_files:
        data = load_json(wf)
        workouts = data.get("workouts", [])

        # Group by (exerciseId, date)
        grouped: dict[tuple, list] = {}
        for w in workouts:
            key = (w["exerciseId"], w["date"])
            grouped.setdefault(key, []).append(w)

        for (exercise_id, date), records in grouped.items():
            # Sort sets within a date by sequence (fallback to original list order)
            records_sorted = sorted(records, key=lambda r: r.get("sequence", 0))

            current_best = best.get(exercise_id)
            if current_best is None or date > current_best[0]:
                best[exercise_id] = (date, records_sorted)

    # Load exercises and update
    exercises_data = load_json(exercises_path)
    exercises = exercises_data["exercises"]

    updated = 0
    skipped = 0
    for ex in exercises:
        ex_id = ex["id"]
        if ex_id not in best:
            skipped += 1
            continue

        date, records = best[ex_id]

        # Skip if already up-to-date
        existing_date = ex.get("lastDate")
        if existing_date and existing_date > date:
            skipped += 1
            continue

        last_sets = [{"reps": r["reps"], "weight": r.get("weight")} for r in records]

        ex["lastSets"] = last_sets
        ex["lastDate"] = date
        updated += 1
        print(f"  ✓ {ex['name']}: lastDate={date}, sets={last_sets}")

    save_json(exercises_path, exercises_data)
    print(f"\nDone. Updated {updated} exercise(s), skipped {skipped} (no history or already current).")


if __name__ == "__main__":
    main()
