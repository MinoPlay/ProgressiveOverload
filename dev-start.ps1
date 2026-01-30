#!/usr/bin/env pwsh
# Quick start script for local development

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Progressive Overload - Dev Setup    ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if config needs to be updated
$configPath = "js/config.js"
$configContent = Get-Content $configPath -Raw

if ($configContent -match "devMode:\s*false") {
    Write-Host "⚠️  Dev mode is currently disabled" -ForegroundColor Yellow
    Write-Host ""
    $response = Read-Host "Enable dev mode? (Y/n)"
    
    if ($response -eq "" -or $response -eq "Y" -or $response -eq "y") {
        $configContent = $configContent -replace "devMode:\s*false", "devMode: true"
        Set-Content -Path $configPath -Value $configContent
        Write-Host "✅ Dev mode enabled in config.js" -ForegroundColor Green
        Write-Host ""
    }
} elseif ($configContent -match "devMode:\s*true") {
    Write-Host "✅ Dev mode is already enabled" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "⚠️  Could not detect dev mode setting" -ForegroundColor Yellow
    Write-Host ""
}

# Check if Node.js is available
$nodeAvailable = Get-Command node -ErrorAction SilentlyContinue

if ($nodeAvailable) {
    Write-Host "🚀 Starting development server..." -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Remember: Changes are not saved in dev mode!" -ForegroundColor Yellow
    Write-Host "   Refresh the browser to reset data" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "🔗 Opening http://localhost:3000" -ForegroundColor Cyan
    Write-Host ""
    
    # Start server and open browser
    Start-Process "http://localhost:3000"
    node server.js
} else {
    Write-Host "❌ Node.js not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start a server manually:" -ForegroundColor Yellow
    Write-Host "  • node server.js" -ForegroundColor White
    Write-Host "  • python -m http.server 3000" -ForegroundColor White
    Write-Host "  • Or use VS Code Live Server extension" -ForegroundColor White
    Write-Host ""
    Write-Host "Then open http://localhost:3000 in your browser" -ForegroundColor Cyan
    Write-Host ""
    
    pause
}
