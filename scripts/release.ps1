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

# Olmayan tag için GitHub beklenen biçimde 404 döndürür. PowerShell 5, stderr'i
# ErrorActionPreference=Stop altında ölümcül hata saydığı için bu tek yoklamayı
# Continue ile çalıştırıp çıkış kodunu kendimiz değerlendiriyoruz.
$oncekiHataTercihi = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& gh api "repos/$depo/git/ref/tags/$etiket" --silent 2>$null
$etiketVar = $LASTEXITCODE -eq 0
$ErrorActionPreference = $oncekiHataTercihi

if (-not $etiketVar) {
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

# electron-builder kurulum ve blockmap'i paralel yüklerken release yoksa iki
# yayıncı aynı anda release oluşturmaya çalışabilir. Release kaydını önceden tek
# kez oluşturarak varlıkların aynı kayıtta toplanmasını garanti ediyoruz.
$ErrorActionPreference = "Continue"
& gh release view $etiket --repo $depo --json id --jq ".id" 2>$null | Out-Null
$releaseVar = $LASTEXITCODE -eq 0
$ErrorActionPreference = $oncekiHataTercihi
if (-not $releaseVar) {
  $notDosyasi = "RELEASE-NOTES-$surum.md"
  if (Test-Path -LiteralPath $notDosyasi) {
    & gh release create $etiket --repo $depo --title "Vega Ticket $surum" --notes-file $notDosyasi
  } else {
    & gh release create $etiket --repo $depo --title "Vega Ticket $surum" --notes "Vega Ticket $surum"
  }
  if ($LASTEXITCODE -ne 0) { throw "$etiket release kaydı oluşturulamadı." }
  Write-Host "[release] $etiket release kaydı oluşturuldu."
}

& npm test --prefix server
if ($LASTEXITCODE -ne 0) { throw "Sunucu testleri başarısız." }

& npm run build --prefix client
if ($LASTEXITCODE -ne 0) { throw "İstemci derlemesi başarısız." }

& npm run release:builder --prefix desktop
if ($LASTEXITCODE -ne 0) { throw "GitHub release yüklemesi başarısız." }

Write-Host "[release] $etiket yayınlandı: https://github.com/$depo/releases/tag/$etiket"
