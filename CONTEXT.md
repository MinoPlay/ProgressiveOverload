# Domain Glossary

- **Set**: one logged row (`exerciseId`, `date`, `reps`, `weight`, `sequence`, `supersetGroupId`).
- **Set volume**: per-exercise effort of a set — `reps × weight` for exercises that require weight and have a weight recorded, otherwise `reps`. Owned by `js/set-metrics.js` (`setVolume`).
- **Set tonnage**: load moved by a set — `reps × weight`, bodyweight = 0. The only measure safe to sum across exercises. Owned by `js/set-metrics.js` (`setTonnage`).
- **Week**: Monday-start; ISO-8601 week numbers (`js/utils.js` `getWeekStart` / `getWeekNumber`).
