[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')

$StateRoot = Join-Path $env:LOCALAPPDATA 'JBYLiquidGlass'
$ProgramsDir = Join-Path $env:LOCALAPPDATA 'Programs\JBYLiquidGlass'
$engine = Get-DreamSkinRuntimeEnginePaths -StateRoot $StateRoot

Stop-DreamSkinTrayProcess -ScriptPaths @($engine.Tray)
Stop-DreamSkinThemeManagerProcess -StateRoot $StateRoot

$agyRestore = Join-Path $PSScriptRoot 'restore-antigravity-dream-skin.ps1'
if (Test-Path -LiteralPath $agyRestore -PathType Leaf) {
  try { & $agyRestore -Port 9235 | Out-Null } catch {}
}

$codexRestore = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'
if (Test-Path -LiteralPath $codexRestore -PathType Leaf) {
  try { & $codexRestore -Uninstall -ForceRestart -NoRelaunch } catch {}
}

foreach ($lnk in @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'JBY Liquid Glass.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Startup')) 'JBY Liquid Glass.lnk'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\JBY Liquid Glass')
)) {
  if (Test-Path -LiteralPath $lnk) {
    Remove-Item -LiteralPath $lnk -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if (Test-Path -LiteralPath $engine.Root) {
  Remove-DreamSkinRuntimeTree -Path $engine.Root -StateRoot $StateRoot
}
if (Test-Path -LiteralPath $ProgramsDir) {
  Remove-Item -LiteralPath $ProgramsDir -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host 'JBY Liquid Glass uninstalled cleanly. Saved themes and custom images were kept.'
