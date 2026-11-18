$releaseDir = Join-Path $PSScriptRoot "..\\release"
$sourceDir = Join-Path $releaseDir "win-unpacked"
$targetDir = Join-Path $releaseDir "OutPut"

if (Test-Path $targetDir) {
  Remove-Item -Recurse -Force $targetDir
}

if (Test-Path $sourceDir) {
  Rename-Item -Path $sourceDir -NewName "OutPut"
}
