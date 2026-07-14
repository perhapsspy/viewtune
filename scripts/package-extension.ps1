param(
  [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$manifestPath = Join-Path $projectRoot "manifest.json"
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json

if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $projectRoot "release\packages"
}
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
$expectedOutputRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot "release\packages"))
if (-not $outputRoot.StartsWith($expectedOutputRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "패키지 출력은 release/packages 안에 있어야 합니다: $outputRoot"
}

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$stageRoot = [IO.Path]::GetFullPath((Join-Path $tempRoot ("viewtune-package-" + [Guid]::NewGuid().ToString("N"))))
if (-not $stageRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "임시 작업 경로가 시스템 임시 디렉터리를 벗어납니다: $stageRoot"
}

New-Item -ItemType Directory -Force -Path $outputRoot,$stageRoot | Out-Null
$zipPath = Join-Path $outputRoot ("viewtune-{0}.zip" -f $manifest.version)

try {
  Copy-Item -LiteralPath $manifestPath -Destination $stageRoot
  Copy-Item -LiteralPath (Join-Path $projectRoot "assets") -Destination $stageRoot -Recurse
  Copy-Item -LiteralPath (Join-Path $projectRoot "src") -Destination $stageRoot -Recurse

  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }
  Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $entryNames = @($archive.Entries | ForEach-Object FullName)
    if ($entryNames -notcontains "manifest.json") {
      throw "ZIP 최상위에 manifest.json이 없습니다."
    }
    if ($entryNames | Where-Object { $_ -match '(^|/)(tests|release|\.git)/' }) {
      throw "배포 ZIP에 개발 전용 파일이 포함됐습니다."
    }
  } finally {
    $archive.Dispose()
  }

  Write-Output $zipPath
} finally {
  if ((Test-Path -LiteralPath $stageRoot) -and $stageRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
  }
}
