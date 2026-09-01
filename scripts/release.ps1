$ErrorActionPreference = "Stop"

$projeKoku = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projeKoku

$surum = (Get-Content -Raw -LiteralPath "desktop/package.json" | ConvertFrom-Json).version
$etiket = "v$surum"
$depo = "saidbayraqtars/vega-ticket-sistem-releases"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) bulunamadı."
}
if (-not $env:GH_TOKEN) {
  throw "GH_TOKEN tanımlı değil."
}

& gh api "repos/$depo/git/ref/tags/$etiket" --silent 2>$null
if ($LASTEXITCODE -ne 0) {
  $anaDalSha = (& gh api "repos/$depo/git/ref/heads/main" --jq ".object.sha").Trim()
  if ($LASTEXITCODE -ne 0 -or -not $anaDalSha) {
    throw "Release deposunun main dalı okunamadı."
  }
  & gh api -X POST "repos/$depo/git/refs" -f "ref=refs/tags/$etiket" -f "sha=$anaDalSha" --silent
  if ($LASTEXITCODE -ne 0) {
    throw "$etiket tag'i oluşturulamadı."
  }
  Write-Host "[release] $etiket tag'i oluşturuldu."
} else {
  Write-Host "[release] $etiket tag'i zaten var."
}

& npm test --prefix server
if ($LASTEXITCODE -ne 0) { throw "Sunucu testleri başarısız." }

& npm run build --prefix client
if ($LASTEXITCODE -ne 0) { throw "İstemci derlemesi başarısız." }

& npm run release:builder --prefix desktop
if ($LASTEXITCODE -ne 0) { throw "GitHub release yüklemesi başarısız." }

Write-Host "[release] $etiket yayınlandı: https://github.com/$depo/releases/tag/$etiket"
