# Deployment Guide

## Quick Deploy to GitHub Pages

### 1. Commit and Push All Files

```powershell
git add .
git commit -m "Initial commit: Progressive Pumping!!! app"
git push origin main
```

### 2. Enable GitHub Pages

1. Go to https://github.com/MinoPlay/ProgressiveOverload/settings/pages
2. Under "Source", select branch: `main`
3. Select folder: `/ (root)`
4. Click "Save"
5. Wait 1-2 minutes for deployment

### 3. Access Your App

Your app will be available at:
**https://minoplay.github.io/ProgressiveOverload/**

### 4. First-Time Setup

1. Create a Personal Access Token:
   - Go to https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Name: "Progressive Pumping!!!"
   - Expiration: 90 days
   - Scope: ✓ repo
   - Generate and copy the token

2. Open your app URL
3. Paste your token in the setup modal
4. Click "Save & Continue"

### 5. Data Files

The app will automatically create these files in your repository:
- `data/exercises.json` - Your exercises
- `data/workouts-YYYY-MM.json` - Your monthly workout logs

These files are created on first use and updated as you log workouts.

## Troubleshooting

### Page Not Found (404)
- Wait a few more minutes for GitHub Pages to deploy
- Check that GitHub Pages is enabled in repository settings
- Ensure the repository is public (or you have GitHub Pro for private Pages)

### Authentication Errors
- Verify your token has `repo` scope
- Check that token hasn't expired
- Try regenerating a new token

### Data Not Saving
- Open browser DevTools (F12) → Console to see errors
- Check that you have write permissions to the repository
- Verify the repository name is correct in the code (MinoPlay/ProgressiveOverload)

## Local Development

To test locally before deploying:

```powershell
# Install a simple HTTP server
npm install -g http-server

# Run from project directory
http-server -p 8080

# Open browser to http://localhost:8080
```

**Note**: You still need a valid GitHub PAT even for local development since data is stored in GitHub.

## Security Reminders

- ⚠️ Never commit your Personal Access Token to the repository
- ⚠️ Use short-lived tokens (30-90 days)
- ⚠️ Only use on trusted devices
- ⚠️ Always logout when done using shared computers

## Updates

To update the app after making changes:

```powershell
git add .
git commit -m "Description of changes"
git push origin main
```

Changes will be live in 1-2 minutes after push.
