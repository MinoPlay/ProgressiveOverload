#!/usr/bin/env pwsh
# Pre-commit check - warns if dev mode is enabled
# You can run this manually before committing

$configPath = "js/config.js"
$configContent = Get-Content $configPath -Raw

Write-Host ""
Write-Host "🔍 Checking configuration before commit..." -ForegroundColor Cyan
Write-Host ""

if ($configContent -match "devMode:\s*true") {
    Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "║         ⚠️  WARNING  ⚠️                ║" -ForegroundColor Red  
    Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Red
    Write-Host ""
    Write-Host "Dev mode is currently ENABLED in js/config.js" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "This will break the production deployment!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please set devMode: false before committing" -ForegroundColor Yellow
    Write-Host ""
    
    $response = Read-Host "Disable dev mode now? (Y/n)"
    
    if ($response -eq "" -or $response -eq "Y" -or $response -eq "y") {
        $configContent = $configContent -replace "devMode:\s*true", "devMode: false"
        Set-Content -Path $configPath -Value $configContent
        Write-Host ""
        Write-Host "✅ Dev mode disabled" -ForegroundColor Green
        Write-Host "✅ Safe to commit now" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "⚠️  Dev mode still enabled - do not push to production!" -ForegroundColor Red
        Write-Host ""
        exit 1
    }
} else {
    Write-Host "✅ Configuration looks good!" -ForegroundColor Green
    Write-Host "✅ Dev mode is disabled (production ready)" -ForegroundColor Green
    Write-Host ""
}
