[CmdletBinding()]
param([int]$Port = 9335, [switch]$ShowWindow)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
. (Join-Path $PSScriptRoot 'localization-windows.ps1')
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

Assert-DreamSkinPort -Port $Port
$SkillRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'JBYLiquidGlass'
$paths = $null
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
$restoreScript = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'
$checkUpdateScript = Join-Path $PSScriptRoot 'check-update.ps1'
$startupShortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'JBY Liquid Glass.lnk'

$agyStartScript = Join-Path $PSScriptRoot 'start-antigravity-dream-skin.ps1'
$agyRestoreScript = Join-Path $PSScriptRoot 'restore-antigravity-dream-skin.ps1'
$agyInjector = Join-Path $PSScriptRoot 'antigravity-injector.mjs'
$agyRoot = Join-Path $StateRoot 'antigravity'
$agyActiveFile = Join-Path $agyRoot 'active-theme.json'
$agyPauseFile = Join-Path $agyRoot 'paused'
$agyStateFile = Join-Path $agyRoot 'state.json'
$agyCustomMediaDir = Join-Path $agyRoot 'custom-media'
$script:agyApplyPending = $false
$script:agyApplyOperation = $null
$script:agyGuardCooldownUntil = [datetime]::MinValue
$script:agyGuardPendingNakedSince = $null
$script:agyGuardLastPidList = ''
$script:agyGuardVerifiedInjectorPid = 0

$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = [System.Threading.Mutex]::new($false, "Local\JBYLiquidGlass.$sid.Tray")
$showEvent = [System.Threading.EventWaitHandle]::new($false,
  [System.Threading.EventResetMode]::AutoReset, "Local\JBYLiquidGlass.$sid.Show")
$acquired = $false
$notify = $null
$trayIcon = $null
try {
  try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) {
    if ($ShowWindow) { [void]$showEvent.Set() }
    exit 0
  }

  $legacyStateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
  if ((Test-Path -LiteralPath (Join-Path $legacyStateRoot 'themes') -PathType Container) -and
    -not (Test-Path -LiteralPath (Join-Path $StateRoot 'themes') -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
    foreach ($dirName in @('themes', 'thumb-cache', 'images', 'active-theme', 'antigravity')) {
      $srcDir = Join-Path $legacyStateRoot $dirName
      $dstDir = Join-Path $StateRoot $dirName
      if ((Test-Path -LiteralPath $srcDir -PathType Container) -and -not (Test-Path -LiteralPath $dstDir)) {
        Copy-Item -LiteralPath $srcDir -Destination $dstDir -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
    foreach ($fileName in @('dream-skin-plugin.json', 'theme-preferences.json', 'guard-config.json', 'config.before-dream-skin.toml', 'language.txt')) {
      $srcFile = Join-Path $legacyStateRoot $fileName
      $dstFile = Join-Path $StateRoot $fileName
      if ((Test-Path -LiteralPath $srcFile -PathType Leaf) -and -not (Test-Path -LiteralPath $dstFile)) {
        Copy-Item -LiteralPath $srcFile -Destination $dstFile -Force -ErrorAction SilentlyContinue
      }
    }
  }

  $initializationLock = Enter-DreamSkinOperationLock
  try {
    $paths = Initialize-DreamSkinThemeStore -SkillRoot $SkillRoot -StateRoot $StateRoot
  } finally {
    Exit-DreamSkinOperationLock -Mutex $initializationLock
  }

  $notify = [System.Windows.Forms.NotifyIcon]::new()
  $iconPath = Join-Path $SkillRoot 'assets\jby-liquid-glass.ico'
  if (Test-Path -LiteralPath $iconPath -PathType Leaf) {
    $trayIcon = [System.Drawing.Icon]::new($iconPath)
    $notify.Icon = $trayIcon
  } else {
    $notify.Icon = [System.Drawing.SystemIcons]::Application
  }
  $notify.Text = 'JBY Liquid Glass'
  $notify.Visible = $true
  $menu = [System.Windows.Forms.ContextMenuStrip]::new()
  $notify.ContextMenuStrip = $menu

  function Show-DreamSkinTrayError {
    param([string]$Message)
    [void][System.Windows.Forms.MessageBox]::Show(
      $Message,
      'JBY Liquid Glass',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    )
  }

  function Get-DreamSkinTrayText {
    param(
      [Parameter(Mandatory = $true)][string]$Key,
      [object[]]$FormatArguments = @()
    )
    $language = Resolve-DreamSkinLanguage -StateRoot $StateRoot
    Get-DreamSkinText -Key $Key -Language $language -FormatArguments $FormatArguments
  }

  function Start-DreamSkinPowerShell {
    param([Parameter(Mandatory = $true)][string]$Script, [string[]]$Arguments = @())
    $conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
    $scriptToken = ConvertTo-DreamSkinProcessArgument -Value $Script
    $argumentLine = '--headless ' + (ConvertTo-DreamSkinProcessArgument -Value $powershell) +
      ' -NoProfile -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' + $scriptToken
    if ($Arguments.Count -gt 0) { $argumentLine += ' ' + ($Arguments -join ' ') }
    $previousLanguage = $env:DREAMSKIN_LANG
    try {
      $env:DREAMSKIN_LANG = Resolve-DreamSkinLanguage -StateRoot $StateRoot
      Start-Process -FilePath $conhost -ArgumentList $argumentLine -WindowStyle Hidden | Out-Null
    } finally {
      $env:DREAMSKIN_LANG = $previousLanguage
    }
  }

  function Set-DreamSkinTrayApplyStatus {
    param([string]$Message, [bool]$Success = $false)
    $script:trayApplyStatus = $Message
    $script:trayApplySucceeded = $Success
  }

  function Complete-DreamSkinTrayApply {
    # Called on the UI timer only after the child exits. A selected theme or
    # a successful process launch is not evidence of rendered appearance.
    $operation = $script:trayApplyOperation
    if ($null -eq $operation) { return }
    $success = $false
    $message = Get-DreamSkinTrayText -Key 'ApplyNotConfirmed'
    $isQuiet = [bool]$operation.Quiet
    try {
      $result = Read-DreamSkinStartResult -StateRoot $StateRoot -Token $operation.Token
      $success = $operation.Process.ExitCode -eq 0 -and $result.outcome -ceq 'success'
      if ($success) {
        $key = if ($isQuiet) { 'AutoGuardAttached' } else { 'Applied' }
        $message = Get-DreamSkinTrayText -Key $key -FormatArguments @($operation.ThemeName)
      } elseif ($result.outcome -ceq 'failure') {
        $message = Get-DreamSkinTrayText -Key 'ApplyFailed' -FormatArguments @($result.category)
      }
    } catch {
      # Missing, malformed, stale and oversized results all fail closed.
    } finally {
      $operation.Timer.Stop()
      $operation.Timer.Dispose()
      $operation.Process.Dispose()
      Remove-Item -LiteralPath $operation.ResultPath -Force -ErrorAction SilentlyContinue
      $script:trayApplyOperation = $null
      $script:trayApplyPending = $false
      $script:guardLastPidList = ''
    }
    Set-DreamSkinTrayApplyStatus -Message $message -Success $success
    if (-not $isQuiet -or $success) {
      $icon = if ($success) { [System.Windows.Forms.ToolTipIcon]::Info } else { [System.Windows.Forms.ToolTipIcon]::Warning }
      $notify.ShowBalloonTip(3200, 'JBY Liquid Glass', $message, $icon)
    }
  }

  function Start-DreamSkinVerifiedTrayApply {
    param(
      [string]$ThemeName = '',
      [string]$ThemeDirectory = '',
      [switch]$RestartExisting,
      [switch]$Quiet
    )
    if ($script:trayApplyPending) { return }
    $script:trayApplyPending = $true
    $script:trayApplyOperation = $null
    $process = $null
    $timer = $null
    try {
      if (-not $ThemeName) {
        $selected = Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata
        $ThemeName = $selected.Theme.name
      }
      $token = [guid]::NewGuid().ToString('N')
      $resultPath = Get-DreamSkinStartResultPath -StateRoot $StateRoot -Token $token
      if (Test-Path -LiteralPath $resultPath) { throw 'Theme application result token already exists.' }
      $restartFlag = if ($RestartExisting) { ' -RestartExisting' } else { ' -PromptRestart' }
      $arguments = '-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' +
        (ConvertTo-DreamSkinProcessArgument -Value $startScript) + ' -Port ' + $Port +
        $restartFlag + ' -ResultToken ' + $token
      if ($ThemeDirectory) {
        $arguments += ' -SavedThemeDirectory ' + (ConvertTo-DreamSkinProcessArgument -Value $ThemeDirectory)
      }
      $timer = [System.Windows.Forms.Timer]::new()
      $timer.Interval = 300
      $timer.add_Tick({
        $operation = $script:trayApplyOperation
        if ($null -eq $operation) { return }
        try {
          $operation.Process.Refresh()
          if ($operation.Process.HasExited) { Complete-DreamSkinTrayApply }
        } catch {
          # Do not report success or permit another selection while the child
          # may still own the operation lock. The next tick retries observation.
          Set-DreamSkinTrayApplyStatus -Message (Get-DreamSkinTrayText -Key 'ApplyWaiting')
        }
      })
      $previousLanguage = $env:DREAMSKIN_LANG
      try {
        $env:DREAMSKIN_LANG = Resolve-DreamSkinLanguage -StateRoot $StateRoot
        $process = Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden -PassThru
      } finally {
        $env:DREAMSKIN_LANG = $previousLanguage
      }
      $script:trayApplyOperation = [pscustomobject]@{
        Process = $process; Timer = $timer; Token = $token; ResultPath = $resultPath; ThemeName = $ThemeName; Quiet = [bool]$Quiet
      }
      $timer.Start()
      Set-DreamSkinTrayApplyStatus -Message (Get-DreamSkinTrayText -Key 'Applying')
    } catch {
      if ($null -ne $timer) { $timer.Stop(); $timer.Dispose() }
      if ($null -ne $process) { $process.Dispose() }
      $script:trayApplyOperation = $null
      $script:trayApplyPending = $false
      Set-DreamSkinTrayApplyStatus -Message (Get-DreamSkinTrayText -Key 'ApplyCouldNotStart')
      if (-not $Quiet) { throw }
    }
  }

  function Add-DreamSkinTrayItem {
    param(
      [Parameter(Mandatory = $true)]
      [AllowEmptyCollection()]
      [System.Windows.Forms.ToolStripItemCollection]$Items,
      [Parameter(Mandatory = $true)][string]$Text,
      [AllowNull()][scriptblock]$Action,
      [bool]$Enabled = $true,
      [bool]$Checked = $false
    )
    $item = [System.Windows.Forms.ToolStripMenuItem]::new($Text)
    $item.Enabled = $Enabled
    $item.Checked = $Checked
    if ($null -ne $Action) {
      $item.add_Click({
        try { & $Action } catch { Show-DreamSkinTrayError -Message $_.Exception.Message }
      }.GetNewClosure())
    }
    [void]$Items.Add($item)
    return $item
  }

  function Add-DreamSkinTrayLanguageMenu {
    $preference = Get-DreamSkinLanguagePreference -StateRoot $StateRoot
    $languageMenu = [System.Windows.Forms.ToolStripMenuItem]::new(
      (Get-DreamSkinTrayText -Key 'Language')
    )
    foreach ($option in @(
      @{ Value = 'system'; Label = (Get-DreamSkinTrayText -Key 'LanguageSystem') },
      @{ Value = 'en-US'; Label = (Get-DreamSkinTrayText -Key 'LanguageEnglish') },
      @{ Value = 'zh-CN'; Label = (Get-DreamSkinTrayText -Key 'LanguageChinese') }
    )) {
      $optionValue = $option.Value
      $optionAction = {
        Set-DreamSkinLanguage -Language $optionValue -StateRoot $StateRoot
        Rebuild-DreamSkinTrayMenu
      }.GetNewClosure()
      $optionItem = Add-DreamSkinTrayItem -Items $languageMenu.DropDownItems -Text $option.Label -Action $optionAction
      $optionItem.Checked = $preference -ceq $optionValue
    }
    [void]$menu.Items.Add($languageMenu)
  }

  function Invoke-DreamSkinTrayThemeOperation {
    param([Parameter(Mandatory = $true)][scriptblock]$Action)
    $themeOperationLock = Enter-DreamSkinOperationLock
    try {
      return & $Action
    } finally {
      Exit-DreamSkinOperationLock -Mutex $themeOperationLock
    }
  }

  function Set-DreamSkinAutoStart {
    param([Parameter(Mandatory = $true)][bool]$Enabled)
    if (-not $Enabled) {
      Remove-Item -LiteralPath $startupShortcut -Force -ErrorAction SilentlyContinue
      return
    }
    $conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($startupShortcut)
    $shortcut.TargetPath = $conhost
    $shortcut.Arguments = "--headless `"$powershell`" -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File `"$PSScriptRoot\tray-jby-liquid-glass.ps1`""
    $shortcut.WorkingDirectory = $SkillRoot
    $shortcut.Description = 'Start JBY Liquid Glass in the notification area'
    if (Test-Path -LiteralPath $iconPath -PathType Leaf) { $shortcut.IconLocation = "$iconPath,0" }
    $shortcut.Save()
  }

  function Get-AgyNode {
    $bundled = Join-Path $SkillRoot 'runtime\node\node.exe'
    if (Test-Path -LiteralPath $bundled -PathType Leaf) { return $bundled }
    $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
  }

  function Get-AgyPort {
    try {
      $cfg = Get-DreamSkinGuardConfig
      if ($cfg.antigravityPort -ge 1024 -and $cfg.antigravityPort -le 65535) { return [int]$cfg.antigravityPort }
    } catch {}
    return 9235
  }

  function Test-AgyPaused {
    return (Test-Path -LiteralPath $agyPauseFile -PathType Leaf)
  }

  function Set-AgyPaused {
    param([bool]$Paused)
    New-Item -ItemType Directory -Force -Path $agyRoot | Out-Null
    if ($Paused) {
      [System.IO.File]::WriteAllText($agyPauseFile, "paused`r`n", [System.Text.UTF8Encoding]::new($false))
    } else {
      Remove-Item -LiteralPath $agyPauseFile -Force -ErrorAction SilentlyContinue
    }
  }

  function Test-AgyCdpUp {
    param([int]$AgyPort = 9235)
    try {
      $res = Invoke-WebRequest -Uri "http://127.0.0.1:$AgyPort/json/version" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
      return ($res.StatusCode -eq 200)
    } catch {
      return $false
    }
  }

  function Get-AgyActiveThemeState {
    if (Test-Path -LiteralPath $agyActiveFile -PathType Leaf) {
      try { return ((Read-DreamSkinUtf8File -Path $agyActiveFile) | ConvertFrom-Json -ErrorAction Stop) } catch {}
    }
    return [pscustomobject]@{ schemaVersion = 1; themeId = 'asuka-liquid-glass'; customImage = $null; customVideo = $null }
  }

  function Set-AgyActiveThemeState {
    param([string]$ThemeId, [string]$CustomImage = '', [string]$CustomVideo = '')
    New-Item -ItemType Directory -Force -Path $agyRoot | Out-Null
    $payload = (@{
      schemaVersion = 1
      themeId = $ThemeId
      customImage = if ($CustomImage) { $CustomImage } else { $null }
      customVideo = if ($CustomVideo) { $CustomVideo } else { $null }
    } | ConvertTo-Json -Depth 4) + "`r`n"
    Write-DreamSkinUtf8FileAtomically -Path $agyActiveFile -Content $payload
  }

  function Test-AgyInjectorRunning {
    try {
      if (Test-Path -LiteralPath $agyStateFile -PathType Leaf) {
        $st = (Read-DreamSkinUtf8File -Path $agyStateFile) | ConvertFrom-Json -ErrorAction Stop
        if ($st.injectorPid) {
          $proc = Get-Process -Id ([int]$st.injectorPid) -ErrorAction SilentlyContinue
          if ($null -ne $proc -and -not $proc.HasExited) {
            $script:agyGuardVerifiedInjectorPid = [int]$st.injectorPid
            return $true
          }
        }
      }
    } catch {}
    try {
      $pattern = [Regex]::Escape($agyInjector)
      $wmi = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -and $_.CommandLine -match $pattern -and $_.CommandLine -match '--watch'
      })
      if ($wmi.Count -gt 0) {
        $script:agyGuardVerifiedInjectorPid = [int]$wmi[0].ProcessId
        return $true
      }
    } catch {}
    return $false
  }

  function Get-AgyShortcutPaths {
    return @(
      (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Antigravity.lnk'),
      (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Antigravity.lnk')
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
  }

  function Test-AgyShortcutsOptimized {
    $sh = New-Object -ComObject WScript.Shell
    $list = @(Get-AgyShortcutPaths)
    if ($list.Count -eq 0) { return $false }
    foreach ($p in $list) {
      try {
        $sc = $sh.CreateShortcut($p)
        if ($sc.Arguments -notmatch '--remote-debugging-port=' -and $sc.Arguments -notmatch 'launch-antigravity-with-jby\.ps1') { return $false }
      } catch { return $false }
    }
    return $true
  }

  function Set-AgyShortcutOptimization {
    param([int]$AgyPort = 9235, [bool]$Enable = $true)
    $sh = New-Object -ComObject WScript.Shell
    $conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
    $agyLauncher = Join-Path $PSScriptRoot 'launch-antigravity-with-jby.ps1'
    $agyExe = Get-AgyExecutablePath
    $count = 0
    foreach ($p in (Get-AgyShortcutPaths)) {
      try {
        $sc = $sh.CreateShortcut($p)
        if ($Enable -and (Test-Path -LiteralPath $agyLauncher -PathType Leaf)) {
          $sc.TargetPath = $conhost
          $sc.Arguments = "--headless `"$powershell`" -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File `"$agyLauncher`""
          if ($agyExe) {
            $sc.WorkingDirectory = Split-Path -Parent $agyExe
            $sc.IconLocation = "$agyExe,0"
          }
        } elseif ($agyExe) {
          $sc.TargetPath = $agyExe
          $sc.Arguments = ''
          $sc.WorkingDirectory = Split-Path -Parent $agyExe
          $sc.IconLocation = "$agyExe,0"
        }
        $sc.Save()
        $count++
      } catch {}
    }
    return $count
  }

  function Complete-AgyTrayApply {
    $op = $script:agyApplyOperation
    if ($null -eq $op) { return }
    $success = $false
    $msg = Get-DreamSkinTrayText -Key 'ApplyNotConfirmed'
    $isQuiet = [bool]$op.Quiet
    try {
      $resPath = Join-Path $agyRoot (".start-result-$($op.Token).json")
      if (Test-Path -LiteralPath $resPath -PathType Leaf) {
        $r = (Read-DreamSkinUtf8File -Path $resPath) | ConvertFrom-Json -ErrorAction Stop
        $success = $op.Process.ExitCode -eq 0 -and "$($r.outcome)" -ceq 'success'
        if ($success) {
          $key = if ($isQuiet) { 'AgyAutoGuardAttached' } else { 'AgyApplied' }
          $msg = Get-DreamSkinTrayText -Key $key -FormatArguments @($op.ThemeName)
        } else {
          $msg = Get-DreamSkinTrayText -Key 'AgyApplyFailed' -FormatArguments @("$($r.category)")
        }
      }
    } catch {
    } finally {
      $op.Timer.Stop(); $op.Timer.Dispose(); $op.Process.Dispose()
      Remove-Item -LiteralPath (Join-Path $agyRoot (".start-result-$($op.Token).json")) -Force -ErrorAction SilentlyContinue
      $script:agyApplyOperation = $null
      $script:agyApplyPending = $false
      $script:agyGuardLastPidList = ''
    }
    if (-not $isQuiet -or $success) {
      $icon = if ($success) { [System.Windows.Forms.ToolTipIcon]::Info } else { [System.Windows.Forms.ToolTipIcon]::Warning }
      $notify.ShowBalloonTip(3000, 'JBY Liquid Glass · Antigravity', $msg, $icon)
    }
  }

  function Start-AgyVerifiedTrayApply {
    param([string]$ThemeId = '', [string]$ThemeName = '', [switch]$RestartExisting, [switch]$Quiet)
    if ($script:agyApplyPending) { return }
    $script:agyApplyPending = $true
    $script:agyApplyOperation = $null
    $process = $null; $timer = $null
    try {
      $agyPort = Get-AgyPort
      if (-not $ThemeName) {
        $st = Get-AgyActiveThemeState
        $ThemeName = if ($ThemeId) { $ThemeId } else { [string]$st.themeId }
      }
      $token = [guid]::NewGuid().ToString('N')
      $restartFlag = if ($RestartExisting) { ' -RestartExisting' } else { ' -PromptRestart' }
      $arguments = '-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' +
        (ConvertTo-DreamSkinProcessArgument -Value $agyStartScript) + ' -Port ' + $agyPort +
        $restartFlag + ' -ResultToken ' + $token
      if ($Quiet) { $arguments += ' -Quiet' }
      if ($ThemeId) { $arguments += ' -ThemeId ' + (ConvertTo-DreamSkinProcessArgument -Value $ThemeId) }
      $timer = [System.Windows.Forms.Timer]::new()
      $timer.Interval = 300
      $timer.add_Tick({
        $op = $script:agyApplyOperation
        if ($null -eq $op) { return }
        try {
          $op.Process.Refresh()
          if ($op.Process.HasExited) { Complete-AgyTrayApply }
        } catch {}
      })
      $process = Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden -PassThru
      $script:agyApplyOperation = [pscustomobject]@{ Process = $process; Timer = $timer; Token = $token; ThemeName = $ThemeName; Quiet = [bool]$Quiet }
      $timer.Start()
    } catch {
      if ($null -ne $timer) { $timer.Stop(); $timer.Dispose() }
      if ($null -ne $process) { $process.Dispose() }
      $script:agyApplyOperation = $null
      $script:agyApplyPending = $false
      if (-not $Quiet) { throw }
    }
  }

  function Add-AgyDreamSkinTrayMenu {
    $agyMenu = [System.Windows.Forms.ToolStripMenuItem]::new((Get-DreamSkinTrayText -Key 'AgyMenu'))
    $agyPaused = Test-AgyPaused
    $agyRunning = Test-AgyInjectorRunning
    $agyActive = Get-AgyActiveThemeState
    $agyPort = Get-AgyPort
    $agyStatus = if ($agyPaused) { Get-DreamSkinTrayText -Key 'AgyStatusPaused' } elseif ($agyRunning) { Get-DreamSkinTrayText -Key 'AgyStatusRunning' } else { Get-DreamSkinTrayText -Key 'AgyStatusStopped' }
    if ($agyActive.themeId) { $agyStatus += " · $($agyActive.themeId)" }
    $null = Add-DreamSkinTrayItem -Items $agyMenu.DropDownItems -Text $agyStatus -Action $null -Enabled $false
    [void]$agyMenu.DropDownItems.Add([System.Windows.Forms.ToolStripSeparator]::new())

    $null = Add-DreamSkinTrayItem -Items $agyMenu.DropDownItems -Text (Get-DreamSkinTrayText -Key 'AgyApply') -Action {
      Start-AgyVerifiedTrayApply
    }
    if ($agyPaused) {
      $null = Add-DreamSkinTrayItem -Items $agyMenu.DropDownItems -Text (Get-DreamSkinTrayText -Key 'AgyResume') -Action {
        Start-AgyVerifiedTrayApply
      }
    } else {
      $null = Add-DreamSkinTrayItem -Items $agyMenu.DropDownItems -Text (Get-DreamSkinTrayText -Key 'AgyPause') -Action {
        Set-AgyPaused -Paused $true
        $p = Get-AgyPort
        $node = Get-AgyNode
        if ($node -and (Test-AgyCdpUp -AgyPort $p)) {
          Start-Process -FilePath $node -ArgumentList @((ConvertTo-DreamSkinProcessArgument -Value $agyInjector), '--remove', '--port', "$p") -WindowStyle Hidden | Out-Null
        }
        $notify.ShowBalloonTip(2600, 'JBY Liquid Glass · Antigravity', (Get-DreamSkinTrayText -Key 'AgyPausedMsg'), [System.Windows.Forms.ToolTipIcon]::Info)
      }
    }

    $agyThemesMenu = [System.Windows.Forms.ToolStripMenuItem]::new((Get-DreamSkinTrayText -Key 'AgyThemes'))
    $savedThemes = @(Get-DreamSkinSavedThemes -StateRoot $StateRoot -SkipImageMetadata)
    if ($savedThemes.Count -eq 0) {
      $empty = [System.Windows.Forms.ToolStripMenuItem]::new((Get-DreamSkinTrayText -Key 'NoSavedThemes'))
      $empty.Enabled = $false
      [void]$agyThemesMenu.DropDownItems.Add($empty)
    } else {
      foreach ($saved in $savedThemes) {
        $tid = Split-Path -Leaf $saved.Path
        $tname = $saved.Name
        try {
          $meta = (Read-DreamSkinUtf8File -Path (Join-Path $saved.Path 'theme.json')) | ConvertFrom-Json -ErrorAction Stop
          if ($meta.id) { $tid = [string]$meta.id }
        } catch {}
        $tAction = {
          Set-AgyPaused -Paused $false
          $p = Get-AgyPort
          if ((Test-AgyCdpUp -AgyPort $p) -and (Test-AgyInjectorRunning)) {
            Set-AgyActiveThemeState -ThemeId $tid
          } else {
            Start-AgyVerifiedTrayApply -ThemeId $tid -ThemeName $tname
          }
        }.GetNewClosure()
        $null = Add-DreamSkinTrayItem -Items $agyThemesMenu.DropDownItems -Text $tname -Action $tAction -Checked ($tid -ceq "$($agyActive.themeId)")
      }
    }
    [void]$agyMenu.DropDownItems.Add($agyThemesMenu)

    $null = Add-DreamSkinTrayItem -Items $agyMenu.DropDownItems -Text (Get-DreamSkinTrayText -Key 'AgyPickMedia') -Action {
      $dlg = [System.Windows.Forms.OpenFileDialog]::new()
      $dlg.Title = '选择 Antigravity 自定义壁纸或动态视频'
      $dlg.Filter = '图片或视频|*.png;*.jpg;*.jpeg;*.webp;*.mp4;*.webm|所有文件|*.*'
      $dlg.Multiselect = $false
      try {
        if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          New-Item -ItemType Directory -Force -Path $agyCustomMediaDir | Out-Null
          $ext = [System.IO.Path]::GetExtension($dlg.FileName).ToLowerInvariant()
          $dst = Join-Path $agyCustomMediaDir ("tray-$(Get-Date -Format 'yyyyMMddHHmmss')$ext")
          Copy-Item -LiteralPath $dlg.FileName -Destination $dst -Force
          $cur = Get-AgyActiveThemeState
          Set-AgyPaused -Paused $false
          if ($ext -in @('.mp4', '.webm', '.mov')) {
            Set-AgyActiveThemeState -ThemeId "$($cur.themeId)" -CustomImage "$($cur.customImage)" -CustomVideo $dst
          } else {
            Set-AgyActiveThemeState -ThemeId "$($cur.themeId)" -CustomImage $dst -CustomVideo ''
          }
          $notify.ShowBalloonTip(2000, 'JBY Liquid Glass · Antigravity', (Get-DreamSkinTrayText -Key 'BackgroundUpdated'), [System.Windows.Forms.ToolTipIcon]::Info)
        }
      } finally { $dlg.Dispose() }
    }

    $null = Add-DreamSkinTrayItem -Items $agyMenu.DropDownItems -Text (Get-DreamSkinTrayText -Key 'AgyResetMedia') -Action {
      $cur = Get-AgyActiveThemeState
      Set-AgyActiveThemeState -ThemeId "$($cur.themeId)"
      $notify.ShowBalloonTip(2000, 'JBY Liquid Glass · Antigravity', (Get-DreamSkinTrayText -Key 'BackgroundUpdated'), [System.Windows.Forms.ToolTipIcon]::Info)
    }

    [void]$agyMenu.DropDownItems.Add([System.Windows.Forms.ToolStripSeparator]::new())
    $guardCfgMenu = Get-DreamSkinGuardConfig
    $agyAutoGuardChecked = [bool]$guardCfgMenu.antigravityAutoGuardEnabled
    $agyAutoLaunchChecked = [bool]$guardCfgMenu.autoLaunchAntigravityOnBoot
    $null = Add-DreamSkinTrayItem -Items $agyMenu.DropDownItems -Text (Get-DreamSkinTrayText -Key 'AgyAutoGuardMenu') -Checked $agyAutoGuardChecked -Action {
      $cur = Get-DreamSkinGuardConfig
      $cur.antigravityAutoGuardEnabled = -not [bool]$cur.antigravityAutoGuardEnabled
      Set-DreamSkinGuardConfig -Config $cur
      $script:agyGuardLastPidList = ''
      $script:agyGuardPendingNakedSince = $null
    }.GetNewClosure()
    $null = Add-DreamSkinTrayItem -Items $agyMenu.DropDownItems -Text (Get-DreamSkinTrayText -Key 'AgyAutoLaunchMenu') -Checked $agyAutoLaunchChecked -Action {
      $cur = Get-DreamSkinGuardConfig
      $cur.autoLaunchAntigravityOnBoot = -not [bool]$cur.autoLaunchAntigravityOnBoot
      Set-DreamSkinGuardConfig -Config $cur
    }.GetNewClosure()

    $optChecked = Test-AgyShortcutsOptimized
    $null = Add-DreamSkinTrayItem -Items $agyMenu.DropDownItems -Text (Get-DreamSkinTrayText -Key 'AgyShortcutOptimize') -Checked $optChecked -Action {
      $p = Get-AgyPort
      $next = -not (Test-AgyShortcutsOptimized)
      [void](Set-AgyShortcutOptimization -AgyPort $p -Enable:$next)
      if ($next) {
        $notify.ShowBalloonTip(3200, 'JBY Liquid Glass · Antigravity', (Get-DreamSkinTrayText -Key 'AgyShortcutOptimized' -FormatArguments @($p)), [System.Windows.Forms.ToolTipIcon]::Info)
      }
    }.GetNewClosure()

    [void]$agyMenu.DropDownItems.Add([System.Windows.Forms.ToolStripSeparator]::new())
    $null = Add-DreamSkinTrayItem -Items $agyMenu.DropDownItems -Text (Get-DreamSkinTrayText -Key 'AgyRestore') -Action {
      $p = Get-AgyPort
      Start-DreamSkinPowerShell -Script $agyRestoreScript -Arguments @('-Port', "$p")
    }

    [void]$menu.Items.Add($agyMenu)
  }

  function Rebuild-DreamSkinTrayMenu {
    $menu.Items.Clear()
    $paused = Test-DreamSkinPaused -StateRoot $StateRoot
    $state = $null
    try { $state = Read-DreamSkinState -Path $paths.State } catch {}
    $active = $null
    try { $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata } catch {}
    $status = if ($paused) {
      Get-DreamSkinTrayText -Key 'StatusPaused'
    } elseif ($state) {
      Get-DreamSkinTrayText -Key 'StatusRunning'
    } else {
      Get-DreamSkinTrayText -Key 'StatusStopped'
    }
    if ($null -ne $active -and $null -ne $active.Theme -and $active.Theme.name) {
      $status += " · $($active.Theme.name)"
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text $status -Action $null -Enabled $false
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())

    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'Apply') -Action {
      Start-DreamSkinVerifiedTrayApply
    }
    # Match macOS menubar: pause = mark + live remove; resume lets the serialized
    # start path clear pause only after its safety checks and any restart consent.
    if ($paused) {
      $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'Resume') -Action {
        Start-DreamSkinVerifiedTrayApply
      }
    } else {
      $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'Pause') -Action {
        # Match macOS pause: marker + live remove with in-window loading / result.
        $pauseNoSessionMessage = Get-DreamSkinTrayText -Key 'PauseNoSession'
        $pauseSucceededMessage = Get-DreamSkinTrayText -Key 'PauseSucceeded'
        $pauseFailedMessage = Get-DreamSkinTrayText -Key 'PauseFailed'
        $removal = Invoke-DreamSkinTrayThemeOperation -Action {
          Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot | Out-Null
          Invoke-DreamSkinLiveRemove -StateRoot $StateRoot `
            -PauseNoSessionMessage $pauseNoSessionMessage `
            -PauseSucceededMessage $pauseSucceededMessage `
            -PauseFailedMessage $pauseFailedMessage
        }
        $icon = if ($removal.Removed) {
          [System.Windows.Forms.ToolTipIcon]::Info
        } else {
          [System.Windows.Forms.ToolTipIcon]::Warning
        }
        $removalMessage = $removal.Message
        $notify.ShowBalloonTip(2800, 'JBY Liquid Glass', $removalMessage, $icon)
        if (-not $removal.Removed -and $removal.Attempted) {
          Show-DreamSkinTrayError -Message $removalMessage
        }
      }
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'ChangeBackground') -Action {
      $dialog = [System.Windows.Forms.OpenFileDialog]::new()
      $dialog.Title = Get-DreamSkinTrayText -Key 'BackgroundTitle'
      $dialog.Filter = Get-DreamSkinTrayText -Key 'ImageFilter'
      $dialog.Multiselect = $false
      try {
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          $null = Invoke-DreamSkinTrayThemeOperation -Action {
            $null = Set-DreamSkinActiveThemeImage -ImagePath $dialog.FileName `
              -StateRoot $StateRoot
            Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
          }
          $notify.ShowBalloonTip(1800, 'JBY Liquid Glass', (Get-DreamSkinTrayText -Key 'BackgroundUpdated'), [System.Windows.Forms.ToolTipIcon]::Info)
        }
      } finally {
        $dialog.Dispose()
      }
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'ImportZip') -Action {
      $dialog = [System.Windows.Forms.OpenFileDialog]::new()
      $dialog.Title = Get-DreamSkinTrayText -Key 'ImportTitle'
      $dialog.Filter = 'Dream Skin theme ZIP|*.zip'
      $dialog.Multiselect = $false
      try {
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          $imported = Import-DreamSkinThemeZip -ArchivePath $dialog.FileName -StateRoot $StateRoot
          if ($imported.Status -ceq 'Duplicate') {
            $message = Get-DreamSkinTrayText -Key 'ThemeExists' -FormatArguments @($imported.Name)
          } elseif ($imported.Replaced) {
            $message = Get-DreamSkinTrayText -Key 'ThemeUpdated' -FormatArguments @($imported.Name)
          } else {
            $message = Get-DreamSkinTrayText -Key 'ThemeImported' -FormatArguments @($imported.Name)
            if ($imported.Renamed) {
              $message += Get-DreamSkinTrayText -Key 'NewIdentifier' -FormatArguments @($imported.Id)
            }
            if ($imported.NameCollision) { $message += Get-DreamSkinTrayText -Key 'NameCollision' }
          }
          if ($imported.SafeCssStatus -ceq 'validated') {
            $message += Get-DreamSkinTrayText -Key 'CssValidated'
          }
          if ($imported.SignatureIgnored) { $message += Get-DreamSkinTrayText -Key 'SignatureIgnored' }
          $cleanupProperty = $imported.PSObject.Properties['CleanupWarning']
          $hasCleanupWarning = $null -ne $cleanupProperty -and
            -not [string]::IsNullOrWhiteSpace("$($cleanupProperty.Value)")
          if ($hasCleanupWarning) {
            $message += Get-DreamSkinTrayText -Key 'CleanupWarning'
          }
          $messageIcon = if ($hasCleanupWarning) {
            [System.Windows.Forms.ToolTipIcon]::Warning
          } else {
            [System.Windows.Forms.ToolTipIcon]::Info
          }
          $notify.ShowBalloonTip(4200, 'JBY Liquid Glass', $message, $messageIcon)
        }
      } finally {
        $dialog.Dispose()
      }
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'SaveCurrent') -Action {
      $name = [Microsoft.VisualBasic.Interaction]::InputBox(
        (Get-DreamSkinTrayText -Key 'SavePrompt'),
        (Get-DreamSkinTrayText -Key 'SaveTitle'),
        ''
      )
      if ($name.Trim()) {
        $saved = Invoke-DreamSkinTrayThemeOperation -Action {
          Save-DreamSkinCurrentTheme -Name $name -StateRoot $StateRoot
        }
        $notify.ShowBalloonTip(
          1800,
          'JBY Liquid Glass',
          (Get-DreamSkinTrayText -Key 'Saved' -FormatArguments @($saved.Theme.name)),
          [System.Windows.Forms.ToolTipIcon]::Info
        )
      }
    }

    $savedMenu = [System.Windows.Forms.ToolStripMenuItem]::new(
      (Get-DreamSkinTrayText -Key 'SavedThemes')
    )
    $savedThemes = @(Get-DreamSkinSavedThemes -StateRoot $StateRoot -SkipImageMetadata)
    if ($savedThemes.Count -eq 0) {
      $empty = [System.Windows.Forms.ToolStripMenuItem]::new(
        (Get-DreamSkinTrayText -Key 'NoSavedThemes')
      )
      $empty.Enabled = $false
      [void]$savedMenu.DropDownItems.Add($empty)
    } else {
      foreach ($saved in $savedThemes) {
        $savedPath = $saved.Path
        $savedName = $saved.Name
        $savedAction = {
          Start-DreamSkinVerifiedTrayApply -ThemeName $savedName -ThemeDirectory $savedPath
        }.GetNewClosure()
        $null = Add-DreamSkinTrayItem -Items $savedMenu.DropDownItems -Text $savedName -Action $savedAction
      }
    }
    [void]$menu.Items.Add($savedMenu)

    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())
    Add-AgyDreamSkinTrayMenu
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())

    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'OpenThemes') -Action {
      $themeDirectoryToken = ConvertTo-DreamSkinProcessArgument -Value $paths.Saved
      Start-Process -FilePath explorer.exe -ArgumentList $themeDirectoryToken | Out-Null
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'OpenImages') -Action {
      $imageDirectoryToken = ConvertTo-DreamSkinProcessArgument -Value $paths.Images
      Start-Process -FilePath explorer.exe -ArgumentList $imageDirectoryToken | Out-Null
    }
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'CheckUpdate') -Action {
      Start-DreamSkinPowerShell -Script $checkUpdateScript -Arguments @('-Interactive')
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'Gallery') -Action {
      Start-Process -FilePath 'https://dreamskin.cc/gallery' | Out-Null
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'Studio') -Action {
      Start-Process -FilePath 'https://dreamskin.cc/studio' | Out-Null
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'OpenSite') -Action {
      Start-Process -FilePath 'https://dreamskin.cc' | Out-Null
    }
    $autoStartEnabled = Test-Path -LiteralPath $startupShortcut -PathType Leaf
    $autoStartAction = {
      Set-DreamSkinAutoStart -Enabled:(-not $autoStartEnabled)
    }.GetNewClosure()
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'LaunchAtLogin') `
      -Action $autoStartAction -Checked $autoStartEnabled
    $guardCfgMenu = Get-DreamSkinGuardConfig
    $autoGuardChecked = [bool]$guardCfgMenu.autoGuardEnabled
    $autoLaunchCodexChecked = [bool]$guardCfgMenu.autoLaunchCodexOnBoot
    $autoGuardAction = {
      $cur = Get-DreamSkinGuardConfig
      $cur.autoGuardEnabled = -not $cur.autoGuardEnabled
      Set-DreamSkinGuardConfig -Config $cur
      $script:guardLastPidList = ''
      $script:guardPendingNakedSince = $null
    }.GetNewClosure()
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'AutoGuardMenu') `
      -Action $autoGuardAction -Checked $autoGuardChecked
    $autoLaunchCodexAction = {
      $cur = Get-DreamSkinGuardConfig
      $cur.autoLaunchCodexOnBoot = -not $cur.autoLaunchCodexOnBoot
      Set-DreamSkinGuardConfig -Config $cur
    }.GetNewClosure()
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'AutoLaunchCodexMenu') `
      -Action $autoLaunchCodexAction -Checked $autoLaunchCodexChecked
    Add-DreamSkinTrayLanguageMenu
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'Restore') -Action {
      $script:trayExiting = $true
      Start-DreamSkinPowerShell -Script $restoreScript -Arguments @(
        '-Port', "$Port", '-RestoreBaseTheme', '-PromptRestart'
      )
      $notify.Visible = $false
      [System.Windows.Forms.Application]::Exit()
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'Exit') -Action {
      $script:trayExiting = $true
      $notify.Visible = $false
      [System.Windows.Forms.Application]::Exit()
    }
  }

  $script:guardConfigPath = Join-Path $StateRoot 'guard-config.json'
  $script:guardCooldownUntil = [datetime]::MinValue
  $script:guardPendingNakedSince = $null
  $script:guardLastPidList = ''
  $script:guardVerifiedInjectorPid = 0
  $script:trayExiting = $false

  function Get-DreamSkinGuardConfig {
    $defaults = [pscustomobject]@{
      schemaVersion = 1
      autoGuardEnabled = $true
      autoLaunchCodexOnBoot = $false
      quietAttach = $true
      checkIntervalMs = 1600
      antigravityAutoGuardEnabled = $true
      autoLaunchAntigravityOnBoot = $false
      antigravityPort = 9235
    }
    if (-not (Test-Path -LiteralPath $script:guardConfigPath -PathType Leaf)) { return $defaults }
    try {
      $parsed = (Read-DreamSkinUtf8File -Path $script:guardConfigPath) | ConvertFrom-Json -ErrorAction Stop
      if ($null -eq $parsed) { return $defaults }
      $pAgyAutoGuard = $parsed.PSObject.Properties['antigravityAutoGuardEnabled']
      $pAgyBoot = $parsed.PSObject.Properties['autoLaunchAntigravityOnBoot']
      $pAgyPort = $parsed.PSObject.Properties['antigravityPort']
      $agyPortVal = if ($null -ne $pAgyPort -and [int]$pAgyPort.Value -ge 1024 -and [int]$pAgyPort.Value -le 65535) { [int]$pAgyPort.Value } else { 9235 }
      return [pscustomobject]@{
        schemaVersion = 1
        autoGuardEnabled = if ($null -ne $parsed.autoGuardEnabled) { [bool]$parsed.autoGuardEnabled } else { $true }
        autoLaunchCodexOnBoot = if ($null -ne $parsed.autoLaunchCodexOnBoot) { [bool]$parsed.autoLaunchCodexOnBoot } else { $false }
        quietAttach = if ($null -ne $parsed.quietAttach) { [bool]$parsed.quietAttach } else { $true }
        checkIntervalMs = 1600
        antigravityAutoGuardEnabled = if ($null -ne $pAgyAutoGuard -and $null -ne $pAgyAutoGuard.Value) { [bool]$pAgyAutoGuard.Value } else { $true }
        autoLaunchAntigravityOnBoot = if ($null -ne $pAgyBoot -and $null -ne $pAgyBoot.Value) { [bool]$pAgyBoot.Value } else { $false }
        antigravityPort = $agyPortVal
      }
    } catch {
      return $defaults
    }
  }

  function Set-DreamSkinGuardConfig {
    param([Parameter(Mandatory = $true)][object]$Config)
    $json = ($Config | ConvertTo-Json -Depth 4) + "`r`n"
    Write-DreamSkinUtf8FileAtomically -Path $script:guardConfigPath -Content $json
  }

  function Test-DreamSkinOperationLockFree {
    $lock = $null
    try {
      $lock = Enter-DreamSkinOperationLock -TimeoutMilliseconds 0
      return $true
    } catch {
      return $false
    } finally {
      if ($null -ne $lock) { Exit-DreamSkinOperationLock -Mutex $lock }
    }
  }

  function Test-DreamSkinRecordedInjectorRunning {
    try {
      $st = Read-DreamSkinState -Path $paths.State
      if ($null -eq $st -or -not $st.injectorPid) { return $false }
      $proc = Get-Process -Id ([int]$st.injectorPid) -ErrorAction SilentlyContinue
      if ($null -eq $proc -or $proc.HasExited) { return $false }
      $script:guardVerifiedInjectorPid = [int]$st.injectorPid
      return $true
    } catch {
      return $false
    }
  }

  function Invoke-DreamSkinAutoGuardTick {
    param([switch]$IsBootCheck)
    if ($script:trayExiting -or $script:trayApplyPending) { return }
    if ((Get-Date) -lt $script:guardCooldownUntil) { return }
    if (Test-DreamSkinPaused -StateRoot $StateRoot) {
      $script:guardPendingNakedSince = $null
      $script:guardLastPidList = ''
      return
    }
    $cfg = Get-DreamSkinGuardConfig
    if (-not $cfg.autoGuardEnabled) {
      if (-not ($IsBootCheck -and $cfg.autoLaunchCodexOnBoot)) {
        $script:guardPendingNakedSince = $null
        return
      }
    }

    $fastProcs = @(Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue)
    if ($fastProcs.Count -eq 0) {
      $script:guardPendingNakedSince = $null
      $script:guardLastPidList = ''
      $script:guardVerifiedInjectorPid = 0
      if ($IsBootCheck -and $cfg.autoLaunchCodexOnBoot -and (Test-DreamSkinOperationLockFree)) {
        $script:guardCooldownUntil = (Get-Date).AddSeconds(22)
        Start-DreamSkinVerifiedTrayApply -RestartExisting -Quiet
      }
      return
    }
    if (-not $cfg.autoGuardEnabled) { return }

    $pidSig = (($fastProcs | Select-Object -ExpandProperty Id | Sort-Object) -join ',') + "|$($script:guardVerifiedInjectorPid)"
    if ($pidSig -ceq $script:guardLastPidList -and $script:guardVerifiedInjectorPid -gt 0) {
      $injAlive = Get-Process -Id $script:guardVerifiedInjectorPid -ErrorAction SilentlyContinue
      if ($null -ne $injAlive -and -not $injAlive.HasExited) { return }
    }

    # Inspect root browser processes (strictly exclude --type=... child renderers/gpu/utilities)
    $allWmi = @(Get-CimInstance Win32_Process -Filter "Name = 'ChatGPT.exe'" -ErrorAction SilentlyContinue)
    $rootProcs = @($allWmi | Where-Object {
      $cmd = "$($_.CommandLine)"
      $cmd -and -not ($cmd -match '(?i)(?:^|\s)--type=')
    })
    if ($rootProcs.Count -eq 0) {
      $script:guardPendingNakedSince = $null
      return
    }

    $hasDebugArg = $false
    foreach ($rp in $rootProcs) {
      if ("$($rp.CommandLine)" -match '(?i)(?:^|\s)--remote-debugging-port=') {
        $hasDebugArg = $true
        break
      }
    }

    $cdpHealthy = $false
    if ($hasDebugArg) {
      try {
        $cdpIdentity = Get-DreamSkinVerifiedCdpIdentityForAnyRegistered -Port $Port
        $cdpHealthy = $null -ne $cdpIdentity
      } catch {
        $cdpHealthy = $false
      }
    }

    if ($cdpHealthy) {
      $script:guardPendingNakedSince = $null
      if (Test-DreamSkinRecordedInjectorRunning) {
        $script:guardLastPidList = $pidSig.Split('|')[0] + "|$($script:guardVerifiedInjectorPid)"
        return
      }
      if (Test-DreamSkinOperationLockFree) {
        $script:guardCooldownUntil = (Get-Date).AddSeconds(18)
        Start-DreamSkinVerifiedTrayApply -Quiet
      }
      return
    }

    # Naked root ChatGPT.exe detected without verified CDP!
    # Never restart background/headless or closing ChatGPT processes that have no visible window.
    $visibleProcs = @($fastProcs | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
    if ($visibleProcs.Count -eq 0) {
      $script:guardPendingNakedSince = $null
      return
    }
    # Wait ~1.4s non-blocking so Store/UWP broker finishes initializing before relaunching cleanly.
    if ($null -eq $script:guardPendingNakedSince) {
      $script:guardPendingNakedSince = Get-Date
      return
    }
    if (((Get-Date) - $script:guardPendingNakedSince).TotalMilliseconds -lt 1350) { return }
    $script:guardPendingNakedSince = $null
    if (Test-DreamSkinOperationLockFree) {
      $script:guardCooldownUntil = (Get-Date).AddSeconds(22)
      Start-DreamSkinVerifiedTrayApply -RestartExisting -Quiet
    }
  }

  function Test-AgyOperationLockFree {
    $lock = $null
    try {
      $lock = [System.Threading.Mutex]::new($false, "Local\JBYLiquidGlass.$sid.AntigravityOperation")
      $ok = $false
      try { $ok = $lock.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ok = $true }
      if ($ok) { try { $lock.ReleaseMutex() } catch {} }
      return $ok
    } catch {
      return $false
    } finally {
      if ($null -ne $lock) { $lock.Dispose() }
    }
  }

  function Invoke-AgyDreamSkinAutoGuardTick {
    param([switch]$IsBootCheck)
    if ($script:trayExiting -or $script:agyApplyPending) { return }
    if ((Get-Date) -lt $script:agyGuardCooldownUntil) { return }
    if (Test-AgyPaused) {
      $script:agyGuardPendingNakedSince = $null
      $script:agyGuardLastPidList = ''
      return
    }
    $cfg = Get-DreamSkinGuardConfig
    $agyPort = if ($cfg.antigravityPort -ge 1024 -and $cfg.antigravityPort -le 65535) { [int]$cfg.antigravityPort } else { 9235 }
    if (-not $cfg.antigravityAutoGuardEnabled) {
      if (-not ($IsBootCheck -and $cfg.autoLaunchAntigravityOnBoot)) {
        $script:agyGuardPendingNakedSince = $null
        return
      }
    }

    $fastProcs = @(Get-Process -Name 'Antigravity' -ErrorAction SilentlyContinue)
    if ($fastProcs.Count -eq 0) {
      $script:agyGuardPendingNakedSince = $null
      $script:agyGuardLastPidList = ''
      $script:agyGuardVerifiedInjectorPid = 0
      if ($IsBootCheck -and $cfg.autoLaunchAntigravityOnBoot -and (Test-AgyOperationLockFree)) {
        $script:agyGuardCooldownUntil = (Get-Date).AddSeconds(22)
        Start-AgyVerifiedTrayApply -RestartExisting -Quiet
      }
      return
    }
    if (-not $cfg.antigravityAutoGuardEnabled) { return }

    $pidSig = (($fastProcs | Select-Object -ExpandProperty Id | Sort-Object) -join ',') + "|$($script:agyGuardVerifiedInjectorPid)"
    if ($pidSig -ceq $script:agyGuardLastPidList -and $script:agyGuardVerifiedInjectorPid -gt 0) {
      $injAlive = Get-Process -Id $script:agyGuardVerifiedInjectorPid -ErrorAction SilentlyContinue
      if ($null -ne $injAlive -and -not $injAlive.HasExited) { return }
    }

    $allWmi = @(Get-CimInstance Win32_Process -Filter "Name = 'Antigravity.exe'" -ErrorAction SilentlyContinue)
    $rootProcs = @($allWmi | Where-Object {
      $cmd = "$($_.CommandLine)"
      $cmd -and -not ($cmd -match '(?i)(?:^|\s)--type=')
    })
    if ($rootProcs.Count -eq 0) {
      $script:agyGuardPendingNakedSince = $null
      return
    }

    $hasDebugArg = $false
    foreach ($rp in $rootProcs) {
      if ("$($rp.CommandLine)" -match '(?i)(?:^|\s)--remote-debugging-port=') {
        $hasDebugArg = $true
        break
      }
    }

    $cdpHealthy = $false
    if ($hasDebugArg) {
      $cdpHealthy = Test-AgyCdpUp -AgyPort $agyPort
    }

    if ($cdpHealthy) {
      $script:agyGuardPendingNakedSince = $null
      if (Test-AgyInjectorRunning) {
        $script:agyGuardLastPidList = $pidSig.Split('|')[0] + "|$($script:agyGuardVerifiedInjectorPid)"
        return
      }
      if (Test-AgyOperationLockFree) {
        $script:agyGuardCooldownUntil = (Get-Date).AddSeconds(18)
        Start-AgyVerifiedTrayApply -Quiet
      }
      return
    }

    # Safety guard: NEVER auto-restart already long-running Antigravity sessions (> 18s old)
    $now = Get-Date
    foreach ($rp in $rootProcs) {
      try {
        $created = if ($rp.CreationDate -is [datetime]) { $rp.CreationDate } else { [System.Management.ManagementDateTimeConverter]::ToDateTime("$($rp.CreationDate)") }
        if (($now - $created).TotalSeconds -gt 18) {
          $script:agyGuardPendingNakedSince = $null
          $script:agyGuardLastPidList = $pidSig
          return
        }
      } catch {
        return
      }
    }

    if ($null -eq $script:agyGuardPendingNakedSince) {
      $script:agyGuardPendingNakedSince = Get-Date
      return
    }
    if (((Get-Date) - $script:agyGuardPendingNakedSince).TotalMilliseconds -lt 1350) { return }
    $script:agyGuardPendingNakedSince = $null
    if (Test-AgyOperationLockFree) {
      $script:agyGuardCooldownUntil = (Get-Date).AddSeconds(24)
      Start-AgyVerifiedTrayApply -RestartExisting -Quiet
    }
  }

  $menu.add_Opening({ Rebuild-DreamSkinTrayMenu })
  function Start-DreamSkinThemeManager {
    $launcher = Join-Path $SkillRoot 'app\launch-jby-liquid-glass.ps1'
    if (Test-Path -LiteralPath $launcher -PathType Leaf) {
      Assert-DreamSkinRuntimeTree -Path (Split-Path -Parent $launcher)
    } else {
      $launcher = Join-Path $env:LOCALAPPDATA 'Programs\JBYLiquidGlass\payload\app\launch-jby-liquid-glass.ps1'
    }
    if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
      throw 'The WPF theme manager launcher is missing. Reinstall JBY Liquid Glass.'
    }
    $previousLanguage = $env:DREAMSKIN_LANG
    try {
      $env:DREAMSKIN_LANG = Resolve-DreamSkinLanguage -StateRoot $StateRoot
      $conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
      $psExe = (Get-Command powershell.exe -ErrorAction Stop).Source
      $argLine = '--headless ' + (ConvertTo-DreamSkinProcessArgument -Value $psExe) +
        ' -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' +
        (ConvertTo-DreamSkinProcessArgument -Value $launcher)
      Start-Process -FilePath $conhost -ArgumentList $argLine -WorkingDirectory $SkillRoot -WindowStyle Hidden | Out-Null
    } finally {
      $env:DREAMSKIN_LANG = $previousLanguage
    }
  }
  $notify.add_DoubleClick({
    try {
      Start-DreamSkinThemeManager
    } catch {
      Show-DreamSkinTrayError -Message $_.Exception.Message
    }
  })
  $showTimer = [System.Windows.Forms.Timer]::new()
  $showTimer.Interval = 400
  $showTimer.add_Tick({
    if ($showEvent.WaitOne(0)) {
      try { Start-DreamSkinThemeManager } catch { Show-DreamSkinTrayError -Message $_.Exception.Message }
    }
  })
  $showTimer.Start()
  $guardTimer = [System.Windows.Forms.Timer]::new()
  $guardTimer.Interval = 1600
  $guardTimer.add_Tick({
    try { Invoke-DreamSkinAutoGuardTick } catch {}
    try { Invoke-AgyDreamSkinAutoGuardTick } catch {}
  })
  $guardTimer.Start()
  $bootTimer = [System.Windows.Forms.Timer]::new()
  $bootTimer.Interval = 1200
  $bootTimer.add_Tick({
    $bootTimer.Stop()
    $bootTimer.Dispose()
    try { Invoke-DreamSkinAutoGuardTick -IsBootCheck } catch {}
    try { Invoke-AgyDreamSkinAutoGuardTick -IsBootCheck } catch {}
  })
  $bootTimer.Start()
  if ($ShowWindow) { Start-DreamSkinThemeManager }
  [System.Windows.Forms.Application]::Run()
} finally {
  if ($null -ne $guardTimer) { $guardTimer.Stop(); $guardTimer.Dispose() }
  if ($null -ne $showTimer) { $showTimer.Dispose() }
  if ($null -ne $script:trayApplyOperation) {
    $script:trayApplyOperation.Timer.Dispose()
    $script:trayApplyOperation.Process.Dispose()
  }
  if ($null -ne $script:agyApplyOperation) {
    $script:agyApplyOperation.Timer.Dispose()
    $script:agyApplyOperation.Process.Dispose()
  }
  $showEvent.Dispose()
  if ($null -ne $notify) { $notify.Dispose() }
  if ($null -ne $trayIcon) { $trayIcon.Dispose() }
  if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
  $mutex.Dispose()
}
