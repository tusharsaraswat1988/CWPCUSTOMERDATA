Add-Type -AssemblyName System.Drawing

$logoPath = Join-Path $PSScriptRoot "..\cwp-logo.png"
$outDir = Join-Path $PSScriptRoot "..\icons"

if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$origImg = [System.Drawing.Bitmap]::FromFile($logoPath)
$navyColor = [System.Drawing.ColorTranslator]::FromHtml("#0f2942")

$sizes = @(72, 96, 128, 144, 152, 180, 192, 384, 512)

foreach ($sz in $sizes) {
    # 1. Standard icon (logo fits nicely in center with small padding)
    $bmp = New-Object System.Drawing.Bitmap $sz, $sz
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    # Fill background with navy
    $brush = New-Object System.Drawing.SolidBrush $navyColor
    $g.FillRectangle($brush, 0, 0, $sz, $sz)
    $brush.Dispose()
    
    # Calculate aspect ratio fitting: logo is square artwork (1:1 ratio)
    # Fit inside ~88% of target square
    $targetW = [math]::Round($sz * 0.90)
    $targetH = [math]::Round($targetW * ($origImg.Height / $origImg.Width))
    $posX = [math]::Round(($sz - $targetW) / 2)
    $posY = [math]::Round(($sz - $targetH) / 2)
    
    $g.DrawImage($origImg, $posX, $posY, $targetW, $targetH)
    $g.Dispose()
    
    $outPath = Join-Path $outDir "icon-$sz`x$sz.png"
    if ($sz -eq 180) {
        $outPath = Join-Path $outDir "apple-touch-icon.png"
    }
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated: $outPath"
}

# Generate Maskable Icons (192 and 512) with safe-zone margin (inner 75% circle safe)
foreach ($sz in @(192, 512)) {
    $bmp = New-Object System.Drawing.Bitmap $sz, $sz
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    # Fill background with navy
    $brush = New-Object System.Drawing.SolidBrush $navyColor
    $g.FillRectangle($brush, 0, 0, $sz, $sz)
    $brush.Dispose()
    
    # Safe zone for maskable icon is centered circle with 80% diameter.
    # Keep logo inside 72% width so it's guaranteed never cut off by any Android launcher shape
    $targetW = [math]::Round($sz * 0.72)
    $targetH = [math]::Round($targetW * ($origImg.Height / $origImg.Width))
    $posX = [math]::Round(($sz - $targetW) / 2)
    $posY = [math]::Round(($sz - $targetH) / 2)
    
    $g.DrawImage($origImg, $posX, $posY, $targetW, $targetH)
    $g.Dispose()
    
    $outPath = Join-Path $outDir "maskable-icon-$sz`x$sz.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated: $outPath"
}

# Keep the curated favicon files in icons/; they are supplied at their intended small sizes.

$origImg.Dispose()
Write-Host "All PWA icons generated successfully!"
