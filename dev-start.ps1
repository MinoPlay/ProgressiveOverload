#!/usr/bin/env pwsh
# Quick start script for local development

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Progressive Overload - Dev Setup    ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is available
$nodeAvailable = Get-Command node -ErrorAction SilentlyContinue

if ($nodeAvailable) {
    Write-Host "🚀 Starting development server..." -ForegroundColor Green
    Write-Host ""
    Write-Host "💡 Configure your GitHub token via the settings panel in the app." -ForegroundColor Cyan
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
