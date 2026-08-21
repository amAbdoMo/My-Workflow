Add-Type -AssemblyName System.Drawing

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$InputPath = Join-Path $ProjectRoot "public\wizard-schedules-icon.png"
$LogoPath = Join-Path $ProjectRoot "public\wizard-schedules-logo.png"
$IconPath = Join-Path $ProjectRoot "public\wizard-schedules-transparent.ico"
$LegacyIconPath = Join-Path $ProjectRoot "public\wizard-schedules.ico"
$PreviewPath = Join-Path $ProjectRoot "public\wizard-schedules-icon-preview.png"

function Convert-BlackBackgroundToTransparency($inputPath) {
  $source = [System.Drawing.Image]::FromFile($inputPath)
  $bitmap = New-Object System.Drawing.Bitmap $source.Width, $source.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.DrawImage($source, 0, 0, $source.Width, $source.Height)
  $graphics.Dispose()
  $source.Dispose()

  for ($y = 0; $y -lt $bitmap.Height; $y++) {
    for ($x = 0; $x -lt $bitmap.Width; $x++) {
      $pixel = $bitmap.GetPixel($x, $y)
      if ($pixel.R -le 8 -and $pixel.G -le 8 -and $pixel.B -le 8) {
        $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $pixel.R, $pixel.G, $pixel.B))
      }
    }
  }

  return $bitmap
}

function New-ResizedPngBytes($source, $size) {
  $canvas = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.DrawImage($source, 0, 0, $size, $size)
  $graphics.Dispose()

  $stream = New-Object System.IO.MemoryStream
  $canvas.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()

  $bytes = $stream.ToArray()
  $stream.Dispose()
  return ,$bytes
}

function Write-Icon($source, $outputPath) {
  $sizes = @(256, 128, 64, 48, 32, 16)
  $entries = @()
  $imageData = New-Object System.Collections.ArrayList
  $offset = 6 + ($sizes.Count * 16)

  foreach ($size in $sizes) {
    [byte[]]$bytes = New-ResizedPngBytes $source $size
    $entry = @{
      Size = $size
      Offset = $offset
      Length = $bytes.Length
    }
    $entries += $entry
    $null = $imageData.Add($bytes)
    $offset += $bytes.Length
  }

  $stream = New-Object System.IO.FileStream($outputPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  $writer = New-Object System.IO.BinaryWriter($stream)

  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]$sizes.Count)

  foreach ($entry in $entries) {
    $widthByte = if ($entry.Size -eq 256) { 0 } else { $entry.Size }
    $writer.Write([Byte]$widthByte)
    $writer.Write([Byte]$widthByte)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$entry.Length)
    $writer.Write([UInt32]$entry.Offset)
  }

  foreach ($bytes in $imageData) {
    $writer.Write([byte[]]$bytes)
  }

  $writer.Dispose()
  $stream.Dispose()
}

$transparent = Convert-BlackBackgroundToTransparency $InputPath
$transparent.Save($LogoPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Icon $transparent $IconPath
Copy-Item -LiteralPath $IconPath -Destination $LegacyIconPath -Force

$preview = New-Object System.Drawing.Bitmap 512, 512, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($preview)
$graphics.Clear([System.Drawing.Color]::FromArgb(245, 248, 252))
$graphics.DrawImage($transparent, 0, 0, 512, 512)
$graphics.Dispose()
$preview.Save($PreviewPath, [System.Drawing.Imaging.ImageFormat]::Png)
$preview.Dispose()
$transparent.Dispose()

Write-Host "Created transparent PNG: $LogoPath"
Write-Host "Created transparent ICO: $IconPath"
Write-Host "Updated legacy ICO: $LegacyIconPath"
Write-Host "Created preview: $PreviewPath"
