[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$RemainingArgs
)

$ErrorActionPreference = 'Stop'
$EngineRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'JBYLiquidGlass'
$AgyRoot = Join-Path $StateRoot 'antigravity'
$NodeExe = Join-Path $EngineRoot 'runtime\node\node.exe'
$AgyInjector = Join-Path $EngineRoot 'scripts\antigravity-injector.mjs'
$TrayScript = Join-Path $EngineRoot 'scripts\tray-jby-liquid-glass.ps1'

function Find-AgyExecutable {
  foreach ($cand in @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Antigravity\Antigravity.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\antigravity\Antigravity.exe'),
    (Join-Path $env:ProgramFiles 'Antigravity\Antigravity.exe')
  )) {
    if ($cand -and (Test-Path -LiteralPath $cand -PathType Leaf)) { return $cand }
  }
  return $null
}

$exe = Find-AgyExecutable
if (-not $exe) {
  throw 'Antigravity.exe not found on this machine.'
}

$launchArgs = @('--remote-debugging-port=9235')
if ($RemainingArgs) {
  foreach ($a in $RemainingArgs) {
    if ($a -and $a -notmatch '(?i)^--remote-debugging-port=') {
      $launchArgs += $a
    }
  }
}
Start-Process -FilePath $exe -ArgumentList $launchArgs -WorkingDirectory (Split-Path -Parent $exe) | Out-Null

# Ensure unified tray is running
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

if (-not $trayRunning -and (Test-Path -LiteralPath $TrayScript -PathType Leaf)) {
  $psExe = (Get-Command powershell.exe -ErrorAction Stop).Source
  Start-Process -FilePath $psExe -ArgumentList "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File `"$TrayScript`"" `
    -WorkingDirectory $EngineRoot -WindowStyle Hidden | Out-Null
}

# Ensure Antigravity 9235 watcher is attached cleanly if not paused
New-Item -ItemType Directory -Force -Path $AgyRoot | Out-Null
$pauseFile = Join-Path $AgyRoot 'paused'
if (-not (Test-Path -LiteralPath $pauseFile -PathType Leaf) -and (Test-Path -LiteralPath $NodeExe -PathType Leaf) -and (Test-Path -LiteralPath $AgyInjector -PathType Leaf)) {
  $pattern = [Regex]::Escape($AgyInjector)
  $existing = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and $_.CommandLine -match $pattern -and $_.CommandLine -match '--watch' -and $_.CommandLine -match '--port\s+9235'
  })
  if ($existing.Count -eq 0) {
    $logOut = Join-Path $AgyRoot 'watcher.log'
    $logErr = Join-Path $AgyRoot 'watcher-err.log'
    $wArgs = "`"$AgyInjector`" --watch --port 9235 --pause-file `"$pauseFile`""
    Start-Process -FilePath $NodeExe -ArgumentList $wArgs -WorkingDirectory $EngineRoot -WindowStyle Hidden `
      -RedirectStandardOutput $logOut -RedirectStandardError $logErr | Out-Null
  }
}
