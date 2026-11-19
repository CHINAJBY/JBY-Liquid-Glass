[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ArchivePath,
  [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'JBYLiquidGlass'),
  [switch]$ConvertToLiquidGlass,
  [ValidateSet('none', 'codex', 'antigravity', 'both')][string]$Target = 'none'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
  throw "Archive not found: $ArchivePath"
}

function ConvertTo-RgbHex {
  param([int]$R, [int]$G, [int]$B)
  return ('#{0:x2}{1:x2}{2:x2}' -f [Math]::Max(0, [Math]::Min(255, $R)), [Math]::Max(0, [Math]::Min(255, $G)), [Math]::Max(0, [Math]::Min(255, $B)))
}

function Get-VibrantAccentColorsFromImage {
  param([Parameter(Mandatory = $true)][string]$ImagePath)
  $bmp = $null
  $thumb = $null
  try {
    $bmp = [System.Drawing.Bitmap]::new($ImagePath)
    $thumb = [System.Drawing.Bitmap]::new($bmp, 32, 32)
    $buckets = @{}
    for ($y = 0; $y -lt 32; $y++) {
      for ($x = 0; $x -lt 32; $x++) {
        $c = $thumb.GetPixel($x, $y)
        if ($c.A -lt 200) { continue }
        $maxC = [Math]::Max($c.R, [Math]::Max($c.G, $c.B))
        $minC = [Math]::Min($c.R, [Math]::Min($c.G, $c.B))
        $lum = (0.2126 * $c.R + 0.7152 * $c.G + 0.0722 * $c.B) / 255.0
        if ($lum -lt 0.14 -or $lum -gt 0.90) { continue }
        $sat = if ($maxC -gt 0) { ($maxC - $minC) / [double]$maxC } else { 0.0 }
        if ($sat -lt 0.18) { continue }
        $qr = [int]([Math]::Floor($c.R / 24.0) * 24 + 12)
        $qg = [int]([Math]::Floor($c.G / 24.0) * 24 + 12)
        $qb = [int]([Math]::Floor($c.B / 24.0) * 24 + 12)
        $key = "$qr,$qg,$qb"
        $weight = 1.0 + ($sat * 3.0)
        if ($buckets.ContainsKey($key)) {
          $buckets[$key].Score += $weight
        } else {
          $buckets[$key] = [pscustomobject]@{ R = $qr; G = $qg; B = $qb; Score = $weight }
        }
      }
    }
    $sorted = @($buckets.Values | Sort-Object -Property Score -Descending)
    if ($sorted.Count -eq 0) {
      return @{ Accent = '#4f6df5'; AccentAlt = '#7aa2ff' }
    }
    $primary = $sorted[0]
    $secondary = $null
    for ($i = 1; $i -lt $sorted.Count; $i++) {
      $cand = $sorted[$i]
      $dist = [Math]::Abs($cand.R - $primary.R) + [Math]::Abs($cand.G - $primary.G) + [Math]::Abs($cand.B - $primary.B)
      if ($dist -ge 72) { $secondary = $cand; break }
    }
    if ($null -eq $secondary) {
      $secondary = [pscustomobject]@{
        R = [int][Math]::Min(255, [Math]::Round($primary.R * 0.84 + 28))
        G = [int][Math]::Min(255, [Math]::Round($primary.G * 0.88 + 26))
        B = [int][Math]::Min(255, [Math]::Round($primary.B * 0.94 + 34))
      }
    }
    return @{
      Accent = (ConvertTo-RgbHex -R $primary.R -G $primary.G -B $primary.B)
      AccentAlt = (ConvertTo-RgbHex -R $secondary.R -G $secondary.G -B $secondary.B)
    }
  } catch {
    return @{ Accent = '#4f6df5'; AccentAlt = '#7aa2ff' }
  } finally {
    if ($null -ne $thumb) { $thumb.Dispose() }
    if ($null -ne $bmp) { $bmp.Dispose() }
  }
}

function Save-ThemeThumbJpeg {
  param(
    [Parameter(Mandatory = $true)][string]$SourceImagePath,
    [Parameter(Mandatory = $true)][string[]]$OutputPaths,
    [double]$FocusX = 0.5,
    [double]$FocusY = 0.45
  )
  $src = $null
  $bmp = $null
  $g = $null
  $encParams = $null
  try {
    $src = [System.Drawing.Bitmap]::new($SourceImagePath)
    $tw = 360
    $th = 200
    $sRatio = $src.Width / [double][Math]::Max(1, $src.Height)
    $tRatio = $tw / [double]$th
    $sx = 0.0; $sy = 0.0; $sw = [double]$src.Width; $sh = [double]$src.Height
    if ($sRatio -gt $tRatio) {
      $sw = $src.Height * $tRatio
      $sx = ($src.Width - $sw) * [Math]::Max(0.0, [Math]::Min(1.0, $FocusX))
    } else {
      $sh = $src.Width / $tRatio
      $sy = ($src.Height - $sh) * [Math]::Max(0.0, [Math]::Min(1.0, $FocusY))
    }
    $bmp = [System.Drawing.Bitmap]::new($tw, $th)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $dstRect = [System.Drawing.Rectangle]::new(0, 0, $tw, $th)
    $g.DrawImage($src, $dstRect, [float]$sx, [float]$sy, [float]$sw, [float]$sh, [System.Drawing.GraphicsUnit]::Pixel)

    $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
    $encParams = [System.Drawing.Imaging.EncoderParameters]::new(1)
    $encParams.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, 86L)

    foreach ($outPath in $OutputPaths) {
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outPath) | Out-Null
      $tmp = "$outPath.tmp-$PID"
      if ($null -ne $jpegCodec) {
        $bmp.Save($tmp, $jpegCodec, $encParams)
      } else {
        $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Jpeg)
      }
      if (Test-Path -LiteralPath $outPath) { Remove-Item -LiteralPath $outPath -Force }
      Move-Item -LiteralPath $tmp -Destination $outPath -Force
    }
  } finally {
    if ($null -ne $encParams) { $encParams.Dispose() }
    if ($null -ne $g) { $g.Dispose() }
    if ($null -ne $bmp) { $bmp.Dispose() }
    if ($null -ne $src) { $src.Dispose() }
  }
}

$themesDir = Join-Path $StateRoot 'themes'
$thumbDir = Join-Path $StateRoot 'thumb-cache'
$activeCodexDir = Join-Path $StateRoot 'active-theme'
$activeAgyFile = Join-Path $StateRoot 'antigravity\active-theme.json'
New-Item -ItemType Directory -Force -Path $themesDir | Out-Null

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ('jby-zip-' + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $stage -Force

  $themeRoot = $stage
  if (-not (Test-Path -LiteralPath (Join-Path $themeRoot 'theme.json') -PathType Leaf)) {
    $sub = Get-ChildItem -LiteralPath $stage -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'theme.json') -PathType Leaf } | Select-Object -First 1
    if ($null -eq $sub) {
      throw 'No theme.json found inside ZIP.'
    }
    $themeRoot = $sub.FullName
  }

  $themeJsonPath = Join-Path $themeRoot 'theme.json'
  $themeObj = (Get-Content -LiteralPath $themeJsonPath -Raw -Encoding UTF8) | ConvertFrom-Json -ErrorAction Stop
  if ($null -eq $themeObj) { throw 'Invalid theme.json inside ZIP.' }

  $rawId = if ($themeObj.id) { [string]$themeObj.id } else { [System.IO.Path]::GetFileNameWithoutExtension($ArchivePath) }
  $themeId = ($rawId.Trim() -replace '[^a-zA-Z0-9._-]', '-')
  if (-not $themeId -or $themeId.StartsWith('.')) { $themeId = 'imported-' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }
  $themeObj | Add-Member -MemberType NoteProperty -Name 'id' -Value $themeId -Force

  $imageName = if ($themeObj.image) { [System.IO.Path]::GetFileName([string]$themeObj.image) } else { '' }
  $imagePath = if ($imageName) { Join-Path $themeRoot $imageName } else { '' }
  if (-not $imagePath -or -not (Test-Path -LiteralPath $imagePath -PathType Leaf)) {
    $fallbackImg = Get-ChildItem -LiteralPath $themeRoot -File | Where-Object { $_.Extension -match '^\.(png|jpe?g|webp)$' } | Select-Object -First 1
    if ($null -eq $fallbackImg) { throw 'No wallpaper image file found beside theme.json.' }
    $imageName = $fallbackImg.Name
    $imagePath = $fallbackImg.FullName
    $themeObj | Add-Member -MemberType NoteProperty -Name 'image' -Value $imageName -Force
  }

  $destDir = Join-Path $themesDir $themeId
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  Get-ChildItem -LiteralPath $destDir -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item -Path (Join-Path $themeRoot '*') -Destination $destDir -Recurse -Force
  $destImagePath = Join-Path $destDir $imageName
  $destThemeJsonPath = Join-Path $destDir 'theme.json'
  $destCssPath = Join-Path $destDir 'theme.css'

  $isLg = $false
  if ($ConvertToLiquidGlass) {
    $isLg = $true
    $themeObj | Add-Member -MemberType NoteProperty -Name 'liquidGlass' -Value $true -Force

    if ($null -eq $themeObj.art) {
      $artObj = [pscustomobject]@{ focusX = 0.5; focusY = 0.45; safeArea = 'none'; taskMode = 'full' }
      $themeObj | Add-Member -MemberType NoteProperty -Name 'art' -Value $artObj -Force
    } else {
      $themeObj.art | Add-Member -MemberType NoteProperty -Name 'safeArea' -Value 'none' -Force
      $themeObj.art | Add-Member -MemberType NoteProperty -Name 'taskMode' -Value 'full' -Force
    }

    if ($null -eq $themeObj.colors) {
      $colorsObj = [pscustomobject]@{}
      $themeObj | Add-Member -MemberType NoteProperty -Name 'colors' -Value $colorsObj -Force
    }
    $curAcc = if ($themeObj.colors.accent) { ([string]$themeObj.colors.accent).Trim() } else { '' }
    $curAlt = if ($themeObj.colors.accentAlt) { ([string]$themeObj.colors.accentAlt).Trim() } else { '' }
    if (-not $curAcc -or -not $curAlt -or ($curAcc -ieq $curAlt)) {
      $sampled = Get-VibrantAccentColorsFromImage -ImagePath $destImagePath
      if (-not $curAcc) { $themeObj.colors | Add-Member -MemberType NoteProperty -Name 'accent' -Value $sampled.Accent -Force }
      $themeObj.colors | Add-Member -MemberType NoteProperty -Name 'accentAlt' -Value $(if ($curAlt -and ($curAlt -ine $curAcc)) { $curAlt } else { $sampled.AccentAlt }) -Force
    }

    if (Test-Path -LiteralPath $destCssPath -PathType Leaf) {
      $origCssPath = Join-Path $destDir 'theme.original.css'
      Copy-Item -LiteralPath $destCssPath -Destination $origCssPath -Force
      $cssRaw = [System.IO.File]::ReadAllText($destCssPath, [System.Text.Encoding]::UTF8)
      $blockPattern = '(?is)(\[data-ds-part="(?:composer|sidebar|main)"\][^{]*\{)([^}]*)(\})'
      $cleanedCss = [System.Text.RegularExpressions.Regex]::Replace($cssRaw, $blockPattern, {
        param($m)
        $head = $m.Groups[1].Value
        $body = $m.Groups[2].Value
        $tail = $m.Groups[3].Value
        $body = [System.Text.RegularExpressions.Regex]::Replace($body, '(?is)(?:-webkit-)?backdrop-filter\s*:\s*[^;{}]*blur\(\s*(?:1\d|2\d|3\d|4\d)\s*px\s*\)[^;{}]*;?', '')
        $body = [System.Text.RegularExpressions.Regex]::Replace($body, '(?is)background(?:-color)?\s*:\s*(?:#[0-9a-f]{3,8}|rgb\(\s*\d+[\s,]+\d+[\s,]+\d+\s*\))[^;{}]*;?', '')
        return ($head + $body + $tail)
      })
      [System.IO.File]::WriteAllText($destCssPath, $cleanedCss, [System.Text.UTF8Encoding]::new($false))
    }
  } else {
    $isLg = [bool]($themeObj.liquidGlass -eq $true -or $themeId -eq 'harmony-liquid-glass-lunar' -or $themeId.EndsWith('-liquid-glass'))
  }

  $jsonOut = ($themeObj | ConvertTo-Json -Depth 10) + "`r`n"
  [System.IO.File]::WriteAllText($destThemeJsonPath, $jsonOut, [System.Text.UTF8Encoding]::new($false))

  $fx = if ($themeObj.art -and $null -ne $themeObj.art.focusX) { [double]$themeObj.art.focusX } else { 0.5 }
  $fy = if ($themeObj.art -and $null -ne $themeObj.art.focusY) { [double]$themeObj.art.focusY } else { 0.45 }
  $safeThumbKey = $themeId -replace '[^a-zA-Z0-9._-]', '_'
  Save-ThemeThumbJpeg -SourceImagePath $destImagePath -OutputPaths @(
    (Join-Path $thumbDir ($safeThumbKey + '.jpg')),
    (Join-Path $thumbDir ('agy_' + $safeThumbKey + '.jpg'))
  ) -FocusX $fx -FocusY $fy

  if ($Target -eq 'antigravity' -or $Target -eq 'both') {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $activeAgyFile) | Out-Null
    $agyActiveObj = [pscustomobject]@{
      schemaVersion = 1
      themeId = $themeId
      customImage = $null
      customVideo = $null
    }
    $agyTmp = "$activeAgyFile.tmp-$PID"
    [System.IO.File]::WriteAllText($agyTmp, (($agyActiveObj | ConvertTo-Json -Depth 3) + "`r`n"), [System.Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $activeAgyFile) { Remove-Item -LiteralPath $activeAgyFile -Force }
    Move-Item -LiteralPath $agyTmp -Destination $activeAgyFile -Force
    Remove-Item -LiteralPath (Join-Path (Split-Path -Parent $activeAgyFile) 'paused') -Force -ErrorAction SilentlyContinue
  }

  if ($Target -eq 'codex' -or $Target -eq 'both') {
    New-Item -ItemType Directory -Force -Path $activeCodexDir | Out-Null
    Get-ChildItem -LiteralPath $activeCodexDir -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item -Path (Join-Path $destDir '*') -Destination $activeCodexDir -Recurse -Force
    $actThemeJson = Join-Path $activeCodexDir 'theme.json'
    if (Test-Path -LiteralPath $actThemeJson -PathType Leaf) {
      [System.IO.File]::SetLastWriteTimeUtc($actThemeJson, [DateTime]::UtcNow)
    }
    Remove-Item -LiteralPath (Join-Path $StateRoot 'paused') -Force -ErrorAction SilentlyContinue
  }

  $res = [pscustomobject]@{
    ok = $true
    themeId = $themeId
    name = $(if ($themeObj.name) { [string]$themeObj.name } else { $themeId })
    liquidGlass = $isLg
    target = $Target
  }
  Write-Output ($res | ConvertTo-Json -Compress)
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
