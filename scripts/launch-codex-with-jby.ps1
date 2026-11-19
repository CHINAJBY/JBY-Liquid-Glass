[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$EngineRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'JBYLiquidGlass'
$CommonPath = Join-Path $EngineRoot 'scripts\common-windows.ps1'
$StartScript = Join-Path $EngineRoot 'scripts\start-dream-skin.ps1'
$TrayScript = Join-Path $EngineRoot 'scripts\tray-jby-liquid-glass.ps1'

. $CommonPath

# 1. Ensure unified tray is running
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$trayRunning = $false
$trayMutex = $null
try {
  $trayMutex = [System.Threading.Mutex]::new($false, "Local\JBYLiquidGlass.$sid.Tray")
  $free = $false
  try { $free = $trayMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $free = $true }
  if ($free) {
    try { $trayMutex.ReleaseMutex() } catch {}
  } else {
    $trayRunning = $true
  }
} catch {} finally {
  if ($null -ne $trayMutex) { $trayMutex.Dispose() }
}
$psExe = (Get-Command powershell.exe -ErrorAction Stop).Source
if (-not $trayRunning -and (Test-Path -LiteralPath $TrayScript -PathType Leaf)) {
  Start-Process -FilePath $psExe -ArgumentList "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File `"$TrayScript`"" `
    -WorkingDirectory $EngineRoot -WindowStyle Hidden | Out-Null
}

function Show-ExistingCodexWindowIfAny {
  $vis = @(Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
  if ($vis.Count -eq 0) { return $false }
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class JbyWinFocus {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@ -ErrorAction SilentlyContinue
  foreach ($p in $vis) {
    try {
      [void][JbyWinFocus]::ShowWindowAsync($p.MainWindowHandle, 9)
      [void][JbyWinFocus]::SetForegroundWindow($p.MainWindowHandle)
    } catch {}
  }
  return $true
}

$cdp9335Alive = $false
try {
  $v = Invoke-RestMethod -Uri 'http://127.0.0.1:9335/json/version' -TimeoutSec 1
  if ($v) { $cdp9335Alive = $true }
} catch {}

$allChat = @(Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue)
$visChat = @($allChat | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })

if ($visChat.Count -gt 0 -and $cdp9335Alive) {
  [void](Show-ExistingCodexWindowIfAny)
  $injAlive = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and $_.CommandLine -match 'JBYLiquidGlass\\engine\\scripts\\injector\.mjs' -and $_.CommandLine -match '--port\s+9335'
  })
  if ($injAlive.Count -eq 0 -and (Test-Path -LiteralPath $StartScript -PathType Leaf)) {
    Start-Process -FilePath $psExe -ArgumentList "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File `"$StartScript`" -Port 9335" `
      -WorkingDirectory $EngineRoot -WindowStyle Hidden | Out-Null
  }
  exit 0
}

# If ChatGPT is running headless (no visible window), first try Store package activation once; if still no window or no CDP, clean stuck zombies
if ($allChat.Count -gt 0 -and $visChat.Count -eq 0) {
  if ($cdp9335Alive) {
    try {
      $codex = Get-DreamSkinCodexInstall
      if ($null -ne $codex) { $null = Start-DreamSkinCodex -Codex $codex }
      Start-Sleep -Milliseconds 1800
      if (Show-ExistingCodexWindowIfAny) { exit 0 }
    } catch {}
  }
  Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Get-Process -Name 'codex' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 600
}

# Launch Codex with CDP 9335 + Liquid Glass skin
Remove-Item -LiteralPath (Join-Path $StateRoot 'paused') -Force -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $StartScript -PathType Leaf) {
  & $psExe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File $StartScript -Port 9335 -RestartExisting
}
