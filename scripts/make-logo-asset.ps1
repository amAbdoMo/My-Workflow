Add-Type -AssemblyName System.Drawing

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$InputPath = Join-Path $ProjectRoot "public\wizard-schedules-icon.png"
$OutputPath = Join-Path $ProjectRoot "public\wizard-schedules-logo.png"

$source = [System.Drawing.Image]::FromFile($InputPath)
$bitmap = New-Object System.Drawing.Bitmap $source.Width, $source.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.DrawImage($source, 0, 0, $source.Width, $source.Height)
$graphics.Dispose()
$source.Dispose()

for ($y = 0; $y -lt $bitmap.Height; $y++) {
  for ($x = 0; $x -lt $bitmap.Width; $x++) {
    $pixel = $bitmap.GetPixel($x, $y)
    $max = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B))
    $min = [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
    if ($max -le 82 -and ($max - $min) -le 25) {
      $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $pixel.R, $pixel.G, $pixel.B))
    }
  }
}

$bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

Write-Host "Created logo asset: $OutputPath"
