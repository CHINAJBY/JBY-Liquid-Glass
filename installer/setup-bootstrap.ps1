[CmdletBinding()]
param(
  [switch]$Install,
  [switch]$LaunchTray,
  [switch]$ShowWindow,
  [switch]$Uninstall,
  [switch]$Silent
)

$ErrorActionPreference = 'Stop'
$payloadRoot = Join-Path $PSScriptRoot 'payload'
$payloadScripts = Join-Path $payloadRoot 'scripts'
$commonPath = Join-Path $payloadScripts 'common-windows.ps1'
$themePath = Join-Path $payloadScripts 'theme-windows.ps1'
$stateRoot = Join-Path $env:LOCALAPPDATA 'JBYLiquidGlass'
$startupShortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'JBY Liquid Glass.lnk'
$managerMaintenance = $null

function Show-JbyBootstrapMessage {
  param(
    [Parameter(Mandatory = $true)][string]$Message,
    [ValidateSet('Info', 'Error')][string]$Kind = 'Info'
  )
  if ($Silent) { return }
  Add-Type -AssemblyName System.Windows.Forms
  $icon = if ($Kind -eq 'Error') {
    [System.Windows.Forms.MessageBoxIcon]::Error
  } else {
    [System.Windows.Forms.MessageBoxIcon]::Information
  }
  [void][System.Windows.Forms.MessageBox]::Show(
    $Message,
    'JBY Liquid Glass',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    $icon
  )
}

function Copy-JbyLegacyUserDataIfNeeded {
  $legacy = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
  if ((Test-Path -LiteralPath (Join-Path $legacy 'themes') -PathType Container) -and
    -not (Test-Path -LiteralPath (Join-Path $stateRoot 'themes') -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
    foreach ($d in @('themes', 'thumb-cache', 'images', 'active-theme', 'antigravity')) {
      $s = Join-Path $legacy $d
      $dst = Join-Path $stateRoot $d
      if ((Test-Path -LiteralPath $s -PathType Container) -and -not (Test-Path -LiteralPath $dst)) {
        Copy-Item -LiteralPath $s -Destination $dst -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
    foreach ($f in @('dream-skin-plugin.json', 'theme-preferences.json', 'guard-config.json', 'config.before-dream-skin.toml', 'language.txt')) {
      $s = Join-Path $legacy $f
      $dst = Join-Path $stateRoot $f
      if ((Test-Path -LiteralPath $s -PathType Leaf) -and -not (Test-Path -LiteralPath $dst)) {
        Copy-Item -LiteralPath $s -Destination $dst -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

function Wait-JbyCodexClosedForSetup {
  while ($true) {
    $registered = @(Get-DreamSkinRegisteredCodexInstalls)
    $running = @($registered | Where-Object { (Get-DreamSkinCodexProcesses -Codex $_).Count -gt 0 })
    if ($running.Count -eq 0) { return }
    if ($Silent) { throw 'Close Codex before installing or updating JBY Liquid Glass.' }
    Add-Type -AssemblyName System.Windows.Forms
    $choice = [System.Windows.Forms.MessageBox]::Show(
      'Codex is currently running. Close it, then click Retry to continue setup.',
      'JBY Liquid Glass Setup',
      [System.Windows.Forms.MessageBoxButtons]::RetryCancel,
      [System.Windows.Forms.MessageBoxIcon]::Information
    )
    if ($choice -ne [System.Windows.Forms.DialogResult]::Retry) {
      throw 'Setup was cancelled because Codex is still running.'
    }
  }
}

try {
  if ($Uninstall -and ($Install -or $LaunchTray -or $ShowWindow)) {
    throw 'Uninstall cannot be combined with install or launch actions.'
  }
  if (-not (Test-Path -LiteralPath $commonPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $themePath -PathType Leaf)) {
    throw 'The installer payload is incomplete.'
  }
  . $commonPath
  . $themePath

  Copy-JbyLegacyUserDataIfNeeded
  $engine = Get-DreamSkinRuntimeEnginePaths -StateRoot $stateRoot

  if ($Uninstall) {
    Stop-DreamSkinTrayProcess -ScriptPaths @($engine.Tray) -RequireStopped
    Stop-DreamSkinThemeManagerProcess -StateRoot $stateRoot
    $managerMaintenance = Enter-DreamSkinThemeManagerMaintenance
    $agyRestore = Join-Path $engine.Scripts 'restore-antigravity-dream-skin.ps1'
    if (Test-Path -LiteralPath $agyRestore -PathType Leaf) {
      try { & $agyRestore -Port 9235 | Out-Null } catch {}
    }
    $restoreRequired = (Test-Path -LiteralPath $engine.Root -PathType Container) -or
      (Test-Path -LiteralPath (Join-Path $stateRoot 'config.before-dream-skin.toml') -PathType Leaf)
    if ($restoreRequired -and (Test-Path -LiteralPath $engine.Restore -PathType Leaf)) {
      $restoreParameters = @{
        Uninstall = $true
        ForceRestart = $true
        NoRelaunch = $true
      }
      if (Test-Path -LiteralPath (Join-Path $stateRoot 'config.before-dream-skin.toml') -PathType Leaf) {
        $restoreParameters.RestoreBaseTheme = $true
      }
      try { & $engine.Restore @restoreParameters } catch {}
    }
    if (Test-Path -LiteralPath $engine.Root -PathType Container) {
      Remove-DreamSkinRuntimeTree -Path $engine.Root -StateRoot $stateRoot
    }
    Remove-Item -LiteralPath $startupShortcut -Force -ErrorAction SilentlyContinue
    exit 0
  }

  $payloadNode = Join-Path $payloadRoot 'runtime\node\node.exe'
  $payloadNodeLicense = Join-Path $payloadRoot 'runtime\node\LICENSE'
  if (-not (Test-Path -LiteralPath $payloadNode -PathType Leaf) -or
    -not (Test-Path -LiteralPath $payloadNodeLicense -PathType Leaf)) {
    throw 'The installer payload is missing its bundled Node.js runtime.'
  }
  $payloadVersion = ([System.IO.File]::ReadAllText((Join-Path $payloadRoot 'VERSION'))).Trim()
  $installedVersion = if (Test-Path -LiteralPath $engine.Version -PathType Leaf) {
    ([System.IO.File]::ReadAllText($engine.Version)).Trim()
  } else { '' }
  $requiredEngineFiles = @(
    'VERSION',
    'assets\jby-liquid-glass.ico',
    'assets\jby-liquid-glass-icon.png',
    'assets\dream-skin.css',
    'assets\renderer-inject.js',
    'assets\selectors.json',
    'assets\antigravity-skin.css',
    'assets\antigravity-inject.js',
    'assets\antigravity-selectors.json',
    'assets\antigravity-preferences.mjs',
    'assets\optical-presets.mjs',
    'scripts\injector.mjs',
    'scripts\antigravity-injector.mjs',
    'scripts\import-theme-zip.ps1',
    'scripts\launch-antigravity-with-jby.ps1',
    'scripts\launch-codex-with-jby.ps1',
    'scripts\tray-jby-liquid-glass.ps1',
    'scripts\start-antigravity-dream-skin.ps1',
    'scripts\restore-antigravity-dream-skin.ps1',
    'app\JBYLiquidGlass.cs',
    'app\launch-jby-liquid-glass.ps1',
    'runtime\node\node.exe',
    'runtime\node\LICENSE'
  )
  $missingEngineFiles = @($requiredEngineFiles | Where-Object {
    -not (Test-Path -LiteralPath (Join-Path $engine.Root $_) -PathType Leaf)
  })
  $engineComplete = $missingEngineFiles.Count -eq 0
  $needsInstall = $Install -or $payloadVersion -cne $installedVersion -or -not $engineComplete

  if ($needsInstall) {
    $registeredInstalls = @()
    try { $registeredInstalls = @(Get-DreamSkinRegisteredCodexInstalls) } catch {}
    if ($registeredInstalls.Count -gt 0) {
      Wait-JbyCodexClosedForSetup
    }
    Stop-DreamSkinTrayProcess -ScriptPaths @($engine.Tray) -RequireStopped
    Stop-DreamSkinThemeManagerProcess -StateRoot $stateRoot
    & (Join-Path $payloadScripts 'install-jby-liquid-glass.ps1') -NoShortcuts
    $engine = Get-DreamSkinRuntimeEnginePaths -StateRoot $stateRoot
  }

  $conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
  if ($LaunchTray) {
    $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
    $argumentLine = '--headless ' + (ConvertTo-DreamSkinProcessArgument -Value $powershell) +
      ' -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' +
      (ConvertTo-DreamSkinProcessArgument -Value $engine.Tray)
    Start-Process -FilePath $conhost -ArgumentList $argumentLine -WorkingDirectory $engine.Root -WindowStyle Hidden | Out-Null
  }
  if ($ShowWindow) {
    $appLauncher = Join-Path $engine.Root 'app\launch-jby-liquid-glass.ps1'
    if (-not (Test-Path -LiteralPath $appLauncher -PathType Leaf)) {
      $appLauncher = Join-Path $payloadRoot 'app\launch-jby-liquid-glass.ps1'
    }
    if (Test-Path -LiteralPath $appLauncher -PathType Leaf) {
      $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
      $uiArgs = '--headless ' + (ConvertTo-DreamSkinProcessArgument -Value $powershell) +
        ' -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' +
        (ConvertTo-DreamSkinProcessArgument -Value $appLauncher)
      Start-Process -FilePath $conhost -ArgumentList $uiArgs -WorkingDirectory $engine.Root -WindowStyle Hidden | Out-Null
    }
  }
} catch {
  Show-JbyBootstrapMessage -Message $_.Exception.Message -Kind Error
  Write-Error $_
  exit 1
} finally {
  if ($null -ne $managerMaintenance) {
    $managerMaintenance.ReleaseMutex()
    $managerMaintenance.Dispose()
  }
}
