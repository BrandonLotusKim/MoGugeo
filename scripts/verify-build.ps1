# MoGugeo 빌드 후 검증 스크립트
# 사용법: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-build.ps1

$ErrorActionPreference = "Stop"
$ok = $true

function Check-File($path, $description) {
    if (-not (Test-Path $path)) {
        Write-Host "FAIL: $description ($path missing)" -ForegroundColor Red
        $script:ok = $false
    } else {
        Write-Host "OK:   $description" -ForegroundColor Green
    }
}

Write-Host "=== MoGugeo Build Verification ==="
Write-Host ""

# 1. TypeScript 출력
Check-File "dist/main.js" "main.ts compiled"
Check-File "dist/preload.js" "preload.ts compiled"

# 2. 렌더러 자산
$renderer = @(
    'main.html','dashboard.html','sentence.html','vocabulary.html',
    'expressions.html','popup.html','mypage.html','settings.html','signup.html',
    'app.js','data-loader.js','styles.css'
)
foreach ($f in $renderer) {
    Check-File "src/renderer/$f" "renderer: $f"
}

# 3. 콘텐츠 데이터
$data = @('sentences.json','words.json','expressions.json','meta.json')
foreach ($f in $data) {
    Check-File "src/data/$f" "data: $f"
}

# 4. 콘텐츠 분량 검증
if (Test-Path 'src/data/meta.json') {
    $meta = Get-Content 'src/data/meta.json' -Raw | ConvertFrom-Json
    Write-Host ""
    Write-Host "Content counts:" -ForegroundColor Cyan
    Write-Host "  sentences: $($meta.counts.sentences)"
    Write-Host "  words: $($meta.counts.words)"
    Write-Host "  expressions: $($meta.counts.expressions)"

    $s = (Get-Content 'src/data/sentences.json' -Raw | ConvertFrom-Json).Count
    $w = (Get-Content 'src/data/words.json' -Raw | ConvertFrom-Json).Count
    $e = (Get-Content 'src/data/expressions.json' -Raw | ConvertFrom-Json).Count

    if ($s -ne $meta.counts.sentences) { Write-Host "MISMATCH: sentences ($s vs $($meta.counts.sentences))" -ForegroundColor Yellow }
    if ($w -ne $meta.counts.words) { Write-Host "MISMATCH: words ($w vs $($meta.counts.words))" -ForegroundColor Yellow }
    if ($e -ne $meta.counts.expressions) { Write-Host "MISMATCH: expressions ($e vs $($meta.counts.expressions))" -ForegroundColor Yellow }
}

# 5. 패키징 결과 (선택)
if (Test-Path 'release') {
    $exe = Get-ChildItem 'release' -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($exe) {
        $sizeMB = [math]::Round($exe.Length / 1MB, 2)
        Write-Host ""
        Write-Host "Installer: $($exe.Name) ($sizeMB MB)" -ForegroundColor Cyan
    }
}

Write-Host ""
if ($ok) {
    Write-Host "=== ALL CHECKS PASSED ===" -ForegroundColor Green
    exit 0
} else {
    Write-Host "=== CHECKS FAILED ===" -ForegroundColor Red
    exit 1
}
