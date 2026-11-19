[CmdletBinding()]
param(
  [int]$Port = 9235
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$EngineRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'JBYLiquidGlass'
$AgyRoot = Join-Path $StateRoot 'antigravity'
$Injector = Join-Path $PSScriptRoot 'antigravity-injector.mjs'
$StateFile = Join-Path $AgyRoot 'state.json'

function Get-AgyNode {
  $bundled = Join-Path $EngineRoot 'runtime\node\node.exe'
  if (Test-Path -LiteralPath $bundled -PathType Leaf) { return $bundled }
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$opMutex = [System.Threading.Mutex]::new($false, "Local\JBYLiquidGlass.$sid.AntigravityOperation")
$acquired = $false
try {
  try { $acquired = $opMutex.WaitOne(12000) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }

  $pattern = [Regex]::Escape($Injector)
  $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    if ($p.CommandLine -and $p.CommandLine -match $pattern) {
      try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
    }
  }

  $node = Get-AgyNode
  if ($node -and (Test-Path -LiteralPath $Injector -PathType Leaf)) {
    $cdpUp = $false
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
      $cdpUp = ($r.StatusCode -eq 200)
    } catch {}
    if ($cdpUp) {
      & $node $Injector --remove --port $Port | Out-Null
    }
  }

  New-Item -ItemType Directory -Force -Path $AgyRoot | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $AgyRoot 'paused'), "paused`r`n", [System.Text.UTF8Encoding]::new($false))
  Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
  Write-Output "Antigravity Dream Skin restored cleanly on port $Port."
} finally {
  if ($acquired) { try { $opMutex.ReleaseMutex() } catch {} }
  $opMutex.Dispose()
}
