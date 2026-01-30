# Dev Mode Quick Reference

## Setup
1. Set `devMode: true` in `js/config.js`
2. Run `node server.js` or `.\dev-start.ps1`
3. Open http://localhost:3000

## Before Deploy
1. Set `devMode: false`
2. Run `.\check-config.ps1`
3. `git add . && git commit && git push`

## Key Points
- Changes not saved (memory only)
- Refresh resets data
- Edit `data/dev-data.json` for custom test data
- Hard refresh: `Ctrl+Shift+R`
