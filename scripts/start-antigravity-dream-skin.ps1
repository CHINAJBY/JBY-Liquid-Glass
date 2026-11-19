[CmdletBinding()]
param(
  [int]$Port = 9235,
  [switch]$PromptRestart,
  [switch]$RestartExisting,
  [switch]$Quiet,
  [string]$ThemeId = '',
  [string]$ResultToken = '',
  [string]$UserDataDir = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$EngineRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'JBYLiquidGlass'
$AgyRoot = Join-Path $StateRoot 'antigravity'
$Injector = Join-Path $PSScriptRoot 'antigravity-injector.mjs'
$PauseFile = Join-Path $AgyRoot 'paused'
$ActiveFile = Join-Path $AgyRoot 'active-theme.json'
$StateFile = Join-Path $AgyRoot 'state.json'

function Get-AgyNode {
  $bundled = Join-Path $EngineRoot 'runtime\node\node.exe'
  if (Test-Path -LiteralPath $bundled -PathType Leaf) { return $bundled }
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Get-AgyExe {
  foreach ($c in @(
    (Join-Path $env:LOCALAPPDATA 'Programs\antigravity\Antigravity.exe'),
    (Join-Path $env:ProgramFiles 'Antigravity\Antigravity.exe')
  )) {
    if ($c -and (Test-Path -LiteralPath $c -PathType Leaf)) { return $c }
  }
  return $null
}

function Write-AgyStartResult {
  param([string]$Outcome, [string]$Category = 'none', [string]$Message = '')
  if (-not $ResultToken) { return }
  $outPath = Join-Path $AgyRoot (".start-result-$ResultToken.json")
  $json = (@{
    schemaVersion = 1
    token = $ResultToken
    outcome = $Outcome
    category = $Category
    message = $Message
  } | ConvertTo-Json -Depth 3) + "`r`n"
  New-Item -ItemType Directory -Force -Path $AgyRoot | Out-Null
  [System.IO.File]::WriteAllText($outPath, $json, [System.Text.UTF8Encoding]::new($false))
}

function Get-AgyHubTargets {
  param([int]$TargetPort)
  try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:$TargetPort/json/list" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    $arr = $res.Content | ConvertFrom-Json
    return @($arr | Where-Object {
      $_.type -eq 'page' -and $_.url -and (
        $_.url -match '^https://(?:127\.0\.0\.1|localhost):\d+/' -or $_.url -match '^vscode-file://'
      )
    })
  } catch {
    return @()
  }
}

function Test-AgyCdpUp {
  param([int]$TargetPort)
  try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:$TargetPort/json/version" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    return ($res.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Stop-AgyWatchersOnly {
  $pattern = [Regex]::Escape($Injector)
  $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    if ($p.CommandLine -and $p.CommandLine -match $pattern -and $p.CommandLine -match '--watch') {
      try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
    }
  }
}

function Test-AgyWatcherRunningOnPort {
  param([int]$TargetPort)
  $pattern = [Regex]::Escape($Injector)
  $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    if ($p.CommandLine -and $p.CommandLine -match $pattern -and $p.CommandLine -match '--watch' -and $p.CommandLine -match "--port\s+$TargetPort") {
      return $true
    }
  }
  return $false
}

function Stop-AgyProcessesGracefully {
  $procs = @(Get-Process -Name 'Antigravity' -ErrorAction SilentlyContinue)
  if ($procs.Count -eq 0) { return }
  foreach ($p in $procs) {
    try { [void]$p.CloseMainWindow() } catch {}
  }
  $deadline = (Get-Date).AddSeconds(8)
  while ((Get-Date) -lt $deadline) {
    $rem = @(Get-Process -Name 'Antigravity' -ErrorAction SilentlyContinue)
    if ($rem.Count -eq 0) { break }
    Start-Sleep -Milliseconds 250
  }
  $leftovers = @(Get-Process -Name 'Antigravity' -ErrorAction SilentlyContinue)
  if ($leftovers.Count -gt 0) {
    $leftovers | Stop-Process -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 800
}

$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$opMutex = [System.Threading.Mutex]::new($false, "Local\JBYLiquidGlass.$sid.AntigravityOperation")
$acquired = $false
try {
  try { $acquired = $opMutex.WaitOne(15000) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) {
    Write-AgyStartResult -Outcome 'failure' -Category 'busy' -Message 'Another Antigravity operation is in progress.'
    throw 'Another Antigravity Dream Skin operation is in progress.'
  }

  New-Item -ItemType Directory -Force -Path $AgyRoot | Out-Null
  $node = Get-AgyNode
  if (-not $node) { throw 'Node.js runtime not found in JBYLiquidGlass engine or PATH.' }
  $exe = Get-AgyExe
  if (-not $exe) { throw 'Antigravity.exe not found.' }
  $exeDir = Split-Path -Parent $exe

  # Ensure isolated state is initialized before anything reads active-theme
  & $node $Injector --self-test | Out-Null

  # Apply requested ThemeId atomically if passed
  if ($ThemeId) {
    $payload = (@{
      schemaVersion = 1
      themeId = $ThemeId
      customImage = $null
      customVideo = $null
    } | ConvertTo-Json -Depth 3) + "`r`n"
    [System.IO.File]::WriteAllText($ActiveFile, $payload, [System.Text.UTF8Encoding]::new($false))
  }

  # Remove paused marker
  Remove-Item -LiteralPath $PauseFile -Force -ErrorAction SilentlyContinue

  $cdpOpen = Test-AgyCdpUp -TargetPort $Port
  if (-not $cdpOpen) {
    $running = @(Get-Process -Name 'Antigravity' -ErrorAction SilentlyContinue)
    if ($running.Count -gt 0 -and -not $RestartExisting) {
      if ($PromptRestart -and -not $Quiet) {
        Add-Type -AssemblyName System.Windows.Forms
        $ans = [System.Windows.Forms.MessageBox]::Show(
          "Antigravity 需要带调试端口 ($Port) 重启一次才能挂载液态玻璃皮肤（当前未发送的草稿可能会丢失）。是否立即重启 Antigravity？",
          'JBY Liquid Glass · Antigravity',
          [System.Windows.Forms.MessageBoxButtons]::YesNo,
          [System.Windows.Forms.MessageBoxIcon]::Question
        )
        if ($ans -ne [System.Windows.Forms.DialogResult]::Yes) {
          Write-AgyStartResult -Outcome 'failure' -Category 'cancelled' -Message '已取消重启 Antigravity。'
          exit 0
        }
      } else {
        Write-AgyStartResult -Outcome 'failure' -Category 'cdp-unavailable' -Message 'Antigravity 未在调试端口启动。'
        throw "Antigravity is running without CDP port $Port."
      }
    }
    if ($running.Count -gt 0) {
      Stop-AgyProcessesGracefully
    }
    $launchArgs = @("--remote-debugging-port=$Port")
    if ($UserDataDir) { $launchArgs += "--user-data-dir=`"$UserDataDir`"" }
    Start-Process -FilePath $exe -ArgumentList $launchArgs -WorkingDirectory $exeDir | Out-Null

    $deadline = (Get-Date).AddSeconds(25)
    while ((Get-Date) -lt $deadline) {
      if ((Get-AgyHubTargets -TargetPort $Port).Count -gt 0) { break }
      Start-Sleep -Milliseconds 350
    }
    if ((Get-AgyHubTargets -TargetPort $Port).Count -eq 0) {
      Write-AgyStartResult -Outcome 'failure' -Category 'cdp-endpoint-unavailable' -Message "Antigravity 未在端口 $Port 暴露页面。"
      throw "Antigravity did not expose a Hub/IDE page on port $Port."
    }
  } else {
    # CDP port is already open; ensure a visible Hub window exists cleanly via second-instance launch if hidden
    $hubs = @(Get-AgyHubTargets -TargetPort $Port)
    if ($hubs.Count -eq 0) {
      $launchArgs = @("--remote-debugging-port=$Port")
      if ($UserDataDir) { $launchArgs += "--user-data-dir=`"$UserDataDir`"" }
      Start-Process -FilePath $exe -ArgumentList $launchArgs -WorkingDirectory $exeDir | Out-Null
      $deadline = (Get-Date).AddSeconds(12)
      while ((Get-Date) -lt $deadline) {
        if ((Get-AgyHubTargets -TargetPort $Port).Count -gt 0) { break }
        Start-Sleep -Milliseconds 300
      }
    }
  }

  $watcherAlive = Test-AgyWatcherRunningOnPort -TargetPort $Port
  if ($watcherAlive -and $ThemeId) {
    # Let running --watch apply the updated active-theme.json cleanly without competing --once
    Start-Sleep -Milliseconds 900
  } elseif (-not $watcherAlive) {
    Stop-AgyWatchersOnly
    $logOut = Join-Path $AgyRoot 'watcher.log'
    $logErr = Join-Path $AgyRoot 'watcher-err.log'
    $watchArgs = "`"$Injector`" --watch --port $Port --pause-file `"$PauseFile`""
    Start-Process -FilePath $node -ArgumentList $watchArgs -WindowStyle Hidden -RedirectStandardOutput $logOut -RedirectStandardError $logErr | Out-Null
    Start-Sleep -Milliseconds 1200
  }

  # Verify visible rendering
  $verified = $false
  $verDeadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $verDeadline) {
    & $node $Injector --verify --port $Port --timeout-ms 5000 | Out-Null
    if ($LASTEXITCODE -eq 0) { $verified = $true; break }
    Start-Sleep -Milliseconds 700
  }

  if (-not $verified) {
    Write-AgyStartResult -Outcome 'failure' -Category 'renderer-verification-failed' -Message 'Antigravity 渲染校验未通过。'
    throw 'Antigravity Dream Skin renderer verification did not pass.'
  }

  $activeName = 'Antigravity'
  try {
    $st = Get-Content -LiteralPath $ActiveFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($st.themeId) { $activeName = [string]$st.themeId }
  } catch {}
  Write-AgyStartResult -Outcome 'success' -Category 'none' -Message $activeName
  Write-Output "Antigravity Dream Skin started & verified on port $Port ($activeName)."
} catch {
  if ($ResultToken) {
    $resPath = Join-Path $AgyRoot (".start-result-$ResultToken.json")
    if (-not (Test-Path -LiteralPath $resPath)) {
      Write-AgyStartResult -Outcome 'failure' -Category 'internal-error' -Message $_.Exception.Message
    }
  }
  throw
} finally {
  if ($acquired) { try { $opMutex.ReleaseMutex() } catch {} }
  $opMutex.Dispose()
}
