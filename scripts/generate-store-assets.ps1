$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$outputRoot = Join-Path $projectRoot "release\store-assets"
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

function Color([string]$hex, [int]$alpha = 255) {
  $value = $hex.TrimStart('#')
  return [Drawing.Color]::FromArgb($alpha,
    [Convert]::ToInt32($value.Substring(0,2),16),
    [Convert]::ToInt32($value.Substring(2,2),16),
    [Convert]::ToInt32($value.Substring(4,2),16))
}

function RoundedPath([Drawing.RectangleF]$rect, [float]$radius) {
  $path = [Drawing.Drawing2D.GraphicsPath]::new()
  $d = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function FillRound($g, [Drawing.Brush]$brush, [Drawing.RectangleF]$rect, [float]$radius) {
  $path = RoundedPath $rect $radius
  try { $g.FillPath($brush, $path) } finally { $path.Dispose() }
}

function StrokeRound($g, [Drawing.Pen]$pen, [Drawing.RectangleF]$rect, [float]$radius) {
  $path = RoundedPath $rect $radius
  try { $g.DrawPath($pen, $path) } finally { $path.Dispose() }
}

function Text($g, [string]$value, [float]$x, [float]$y, [float]$size, [string]$hex, [Drawing.FontStyle]$style = [Drawing.FontStyle]::Regular, [string]$family = "Segoe UI") {
  $font = [Drawing.Font]::new($family, $size, $style, [Drawing.GraphicsUnit]::Pixel)
  $brush = [Drawing.SolidBrush]::new((Color $hex))
  try { $g.DrawString($value, $font, $brush, $x, $y) } finally { $brush.Dispose(); $font.Dispose() }
}

function NewCanvas([int]$width, [int]$height, [string]$start, [string]$end) {
  $bitmap = [Drawing.Bitmap]::new($width, $height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $gradient = [Drawing.Drawing2D.LinearGradientBrush]::new([Drawing.Rectangle]::new(0,0,$width,$height), (Color $start), (Color $end), 35)
  $g.FillRectangle($gradient, 0, 0, $width, $height)
  $gradient.Dispose()
  return @{ Bitmap = $bitmap; Graphics = $g }
}

function DrawMark($g, [float]$x, [float]$y, [float]$size) {
  $base = [Drawing.SolidBrush]::new((Color "11151c"))
  $accent = [Drawing.Pen]::new((Color "86aaff"), $size * 0.06)
  $muted = [Drawing.Pen]::new((Color "687386"), $size * 0.045)
  $dot = [Drawing.SolidBrush]::new((Color "b7c9ff"))
  try {
    FillRound $g $base ([Drawing.RectangleF]::new($x,$y,$size,$size)) ($size * 0.23)
    StrokeRound $g $accent ([Drawing.RectangleF]::new($x+$size*.17,$y+$size*.26,$size*.66,$size*.48)) ($size*.11)
    $g.FillEllipse($dot, $x+$size*.66, $y+$size*.38, $size*.065, $size*.065)
    foreach ($offset in .31,.46,.61) {
      $g.DrawLine($muted, $x+$size*$offset, $y+$size*.64, $x+$size*($offset+.08), $y+$size*.64)
    }
  } finally { $base.Dispose(); $accent.Dispose(); $muted.Dispose(); $dot.Dispose() }
}

# Small promo 440x280
$canvas = NewCanvas 440 280 "0c0f15" "172239"
$bmp = $canvas.Bitmap; $g = $canvas.Graphics
$glow = [Drawing.SolidBrush]::new((Color "5d80d8" 32))
$gridPen = [Drawing.Pen]::new((Color "8ca6df" 18), 1)
try {
  $g.FillEllipse($glow, 10, 25, 250, 250)
  for ($x=0; $x -lt 440; $x+=40) { $g.DrawLine($gridPen,$x,0,$x,280) }
  for ($y=0; $y -lt 280; $y+=40) { $g.DrawLine($gridPen,0,$y,440,$y) }
  DrawMark $g 34 72 112
  Text $g "ViewTune" 165 78 38 "f4f7fb" ([Drawing.FontStyle]::Bold)
  Text $g "VIDEO PACE & FRAME" 168 126 12 "9fb7f1" ([Drawing.FontStyle]::Bold)
  Text $g "2x  G" 169 174 18 "d8e2ff" ([Drawing.FontStyle]::Bold)
  Text $g "FIT" 244 174 18 "d8e2ff" ([Drawing.FontStyle]::Bold)
  Text $g "21:9" 307 174 18 "d8e2ff" ([Drawing.FontStyle]::Bold)
  $linePen = [Drawing.Pen]::new((Color "86aaff"), 3)
  $g.DrawLine($linePen,170,207,362,207)
  $linePen.Dispose()
  $bmp.Save((Join-Path $outputRoot "viewtune-promo-440x280.png"), [Drawing.Imaging.ImageFormat]::Png)
} finally { $glow.Dispose(); $gridPen.Dispose(); $g.Dispose(); $bmp.Dispose() }

# Store screenshot 1280x800
$canvas = NewCanvas 1280 800 "0b0d12" "101a2a"
$bmp = $canvas.Bitmap; $g = $canvas.Graphics
$panelBrush = [Drawing.SolidBrush]::new((Color "121720"))
$panel2 = [Drawing.SolidBrush]::new((Color "191f2a"))
$videoBrush = [Drawing.Drawing2D.LinearGradientBrush]::new([Drawing.Rectangle]::new(90,210,700,394), (Color "10151e"), (Color "263b67"), 25)
$accentPen = [Drawing.Pen]::new((Color "86aaff"), 3)
$softPen = [Drawing.Pen]::new((Color "2d3748"), 2)
try {
  Text $g "Tune the video, not the page." 64 48 34 "f3f6fb" ([Drawing.FontStyle]::Bold)
  Text $g "Playback speed  /  Fit to window  /  21:9 crop" 68 96 18 "9ca8b9"

  FillRound $g $panelBrush ([Drawing.RectangleF]::new(54,150,780,574)) 24
  StrokeRound $g $softPen ([Drawing.RectangleF]::new(54,150,780,574)) 24
  foreach ($dotSpec in @(@("ef6a6a",82), @("e2b75d",102), @("6ec88b",122))) {
    $dotBrush = [Drawing.SolidBrush]::new((Color $dotSpec[0]))
    try { $g.FillEllipse($dotBrush, [int]$dotSpec[1],174,10,10) } finally { $dotBrush.Dispose() }
  }
  FillRound $g $panel2 ([Drawing.RectangleF]::new(160,168,610,24)) 12
  Text $g "video.example" 178 170 12 "697486"

  $g.FillRectangle($videoBrush, 90,210,700,394)
  StrokeRound $g $accentPen ([Drawing.RectangleF]::new(118,246,644,276)) 18
  Text $g "21:9" 388 332 62 "dce7ff" ([Drawing.FontStyle]::Bold)
  Text $g "CURRENT FRAME / COVER" 329 404 15 "93abde" ([Drawing.FontStyle]::Bold)
  $controlBrush = [Drawing.SolidBrush]::new((Color "0a0d12" 210))
  $progressBrush = [Drawing.SolidBrush]::new((Color "86aaff"))
  $thumbBrush = [Drawing.SolidBrush]::new((Color "dce7ff"))
  $playBrush = [Drawing.SolidBrush]::new((Color "eef3ff"))
  try {
    $g.FillRectangle($controlBrush,90,548,700,56)
    $g.FillRectangle($progressBrush,118,574,480,4)
    $g.FillEllipse($thumbBrush,594,569,14,14)
    $playPoints = [Drawing.PointF[]]@([Drawing.PointF]::new(114,558), [Drawing.PointF]::new(114,578), [Drawing.PointF]::new(130,568))
    $g.FillPolygon($playBrush, $playPoints)
  } finally { $controlBrush.Dispose(); $progressBrush.Dispose(); $thumbBrush.Dispose(); $playBrush.Dispose() }
  Text $g "1:00" 153 560 14 "b7c0cf"
  Text $g "[ ]" 742 556 20 "b7c0cf" ([Drawing.FontStyle]::Bold)

  FillRound $g $panelBrush ([Drawing.RectangleF]::new(866,136,356,584)) 26
  StrokeRound $g $accentPen ([Drawing.RectangleF]::new(866,136,356,584)) 26
  DrawMark $g 894 164 38
  Text $g "ViewTune" 943 168 22 "f5f7fb" ([Drawing.FontStyle]::Bold)
  Text $g "x" 1168 170 18 "8f98a8" ([Drawing.FontStyle]::Bold)

  $cardBrush = [Drawing.SolidBrush]::new((Color "171d27"))
  $buttonBrush = [Drawing.SolidBrush]::new((Color "10151d"))
  $keyPen = [Drawing.Pen]::new((Color "526078"), 1)
  try {
    # Current popup settings: one G -> target-speed mapping card.
    FillRound $g $cardBrush ([Drawing.RectangleF]::new(894,236,190,58)) 12
    FillRound $g $buttonBrush ([Drawing.RectangleF]::new(902,245,42,40)) 8
    StrokeRound $g $keyPen ([Drawing.RectangleF]::new(908,253,30,24)) 5
    Text $g "G" 918 256 13 "edf2ff" ([Drawing.FontStyle]::Bold)
    Text $g "->" 950 255 15 "7f8999" ([Drawing.FontStyle]::Bold)
    Text $g "-" 979 253 17 "aab3c2" ([Drawing.FontStyle]::Bold)
    Text $g "2x" 1001 253 17 "f4f7fb" ([Drawing.FontStyle]::Bold)
    Text $g "+" 1051 253 17 "aab3c2" ([Drawing.FontStyle]::Bold)

    FillRound $g $cardBrush ([Drawing.RectangleF]::new(1092,236,48,58)) 12
    Text $g "..." 1104 249 16 "a8c1ff" ([Drawing.FontStyle]::Bold)
    $feedbackDot = [Drawing.SolidBrush]::new((Color "86aaff"))
    try { $g.FillEllipse($feedbackDot,1125,272,6,6) } finally { $feedbackDot.Dispose() }
    FillRound $g $cardBrush ([Drawing.RectangleF]::new(1148,236,46,58)) 12
    Text $g "R" 1162 253 16 "9da7b8" ([Drawing.FontStyle]::Bold)

    # Five remaining shortcuts in the compact grid.
    $shortcutSpecs = @(
      @{ Glyph = "21:9"; Key = "B" },
      @{ Glyph = "FIT"; Key = "V" },
      @{ Glyph = "-.5"; Key = "[" },
      @{ Glyph = "+.5"; Key = "]" },
      @{ Glyph = "1x"; Key = "R" }
    )
    for ($i = 0; $i -lt $shortcutSpecs.Count; $i++) {
      $x = 894 + ($i * 60)
      FillRound $g $cardBrush ([Drawing.RectangleF]::new($x,312,52,82)) 10
      Text $g $shortcutSpecs[$i].Glyph ($x + 7) 323 12 "aeb7c5" ([Drawing.FontStyle]::Bold)
      StrokeRound $g $keyPen ([Drawing.RectangleF]::new($x+11,358,30,24)) 5
      Text $g $shortcutSpecs[$i].Key ($x+21) 361 12 "edf2ff" ([Drawing.FontStyle]::Bold)
    }
  } finally { $cardBrush.Dispose(); $buttonBrush.Dispose(); $keyPen.Dispose() }

  Text $g "G -> target speed" 894 424 15 "b9cbff" ([Drawing.FontStyle]::Bold)
  Text $g "Shortcut and speed stay together." 894 452 13 "909bab"
  Text $g "v0.3.0" 1148 678 11 "697486"

  $bmp.Save((Join-Path $outputRoot "viewtune-screenshot-1280x800.png"), [Drawing.Imaging.ImageFormat]::Png)
} finally { $panelBrush.Dispose(); $panel2.Dispose(); $videoBrush.Dispose(); $accentPen.Dispose(); $softPen.Dispose(); $g.Dispose(); $bmp.Dispose() }

Write-Output $outputRoot
