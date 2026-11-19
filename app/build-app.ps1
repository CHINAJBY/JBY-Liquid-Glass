$ErrorActionPreference = 'Stop'
$AppDir = $PSScriptRoot
$ProjRoot = Split-Path -Parent $AppDir
$FxDir = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
$Csc = Join-Path $FxDir 'csc.exe'
$Src = Join-Path $AppDir 'JBYLiquidGlass.cs'
$Out = Join-Path $AppDir 'JBYLiquidGlass.exe'
$Ico = Join-Path $ProjRoot 'assets\jby-liquid-glass.ico'

if (!(Test-Path -LiteralPath $Csc -PathType Leaf)) {
  throw "csc.exe not found at $Csc"
}
if (!(Test-Path -LiteralPath $Ico -PathType Leaf)) {
  throw "App icon not found at $Ico"
}

$refs = @(
  "$FxDir\System.dll",
  "$FxDir\System.Core.dll",
  "$FxDir\System.Drawing.dll",
  "$FxDir\System.Windows.Forms.dll",
  "$FxDir\System.Web.Extensions.dll",
  "$FxDir\System.Xml.dll",
  "$FxDir\System.Xaml.dll",
  "$FxDir\WPF\PresentationCore.dll",
  "$FxDir\WPF\PresentationFramework.dll",
  "$FxDir\WPF\WindowsBase.dll"
)

$argsList = @(
  '/nologo',
  '/target:winexe',
  '/optimize+',
  '/platform:anycpu',
  '/utf8output',
  "/win32icon:$Ico",
  "/out:$Out"
)
foreach ($r in $refs) { $argsList += "/reference:$r" }
$argsList += $Src

Write-Host "Building $Out..."
& $Csc @argsList
if ($LASTEXITCODE -ne 0) {
  throw "csc.exe failed with exit code $LASTEXITCODE"
}
Write-Host "BUILD_OK: $Out ($((Get-Item $Out).Length) bytes)"
