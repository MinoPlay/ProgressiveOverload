# Local Development Guide

## Quick Start

1. **Enable dev mode** in `js/config.js`:
   ```javascript
   devMode: true
   ```

2. **Start server**:
   ```powershell
   node server.js          # Recommended
   # OR
   python -m http.server 3000
   # OR
   .\dev-start.ps1
   ```

3. **Open** http://localhost:3000

## What Dev Mode Does

✅ No GitHub auth needed  
✅ Uses dummy data (8 exercises, 14 workouts)  
✅ All features work  
⚠️ Changes not saved (memory only)  
⚠️ Refresh resets data

## Workflow

```powershell
# 1. Set devMode: true in js/config.js
# 2. Start server
node server.js

# 3. Edit code → Save → Refresh browser
# 4. Test changes
# 5. Repeat

# 6. Before deploy:
#    - Set devMode: false
#    - Run .\check-config.ps1
#    - Commit & push
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "GitHub token required" | Set `devMode: true` |
| Module errors | Use local server (not `file://`) |
| Changes not showing | Hard refresh: `Ctrl+Shift+R` |
| CORS errors | Access via `http://localhost` |

## Customize Test Data

Edit `data/dev-data.json`:
```json
{
  "exercises": [...],
  "workouts": [...]
}
```

---

💪 **Ready to code!**
