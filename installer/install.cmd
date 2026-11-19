@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\app\build-app.ps1"
if errorlevel 1 exit /b 1
echo Ready. Run install-jby-liquid-glass.ps1 or setup-bootstrap.ps1 -Install -LaunchTray -ShowWindow
