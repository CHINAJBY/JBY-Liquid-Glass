[CmdletBinding()]
param(
  [switch]$SmokeTest
)

$ErrorActionPreference = 'Stop'
$progRoot = Join-Path $env:LOCALAPPDATA 'Programs\JBYLiquidGlass'
if (Test-Path -LiteralPath $progRoot -PathType Container) {
  $env:JBY_LIQUID_GLASS_BASE_DIR = $progRoot
} else {
  $env:JBY_LIQUID_GLASS_BASE_DIR = Split-Path -Parent $PSScriptRoot
}

$csPath = Join-Path $PSScriptRoot 'JBYLiquidGlass.cs'
if (-not (Test-Path -LiteralPath $csPath -PathType Leaf)) {
  throw "Missing WPF UI source: $csPath"
}

$src = [System.IO.File]::ReadAllText($csPath, [System.Text.Encoding]::UTF8)
Add-Type -TypeDefinition $src -ReferencedAssemblies @(
  'PresentationFramework', 'PresentationCore', 'WindowsBase', 'System.Xaml',
  'System.Web.Extensions', 'System.Drawing', 'System.Windows.Forms', 'System.Core', 'Microsoft.CSharp'
) -ErrorAction Stop

$runArgs = if ($SmokeTest) { [string[]]@('--smoke-test') } else { [string[]]@() }
$code = [JBYLiquidGlassApp.Program]::Run($runArgs)
exit $code
