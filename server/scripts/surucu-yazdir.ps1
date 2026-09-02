# Etiketi Windows yazdırma SÜRÜCÜSÜ üzerinden basar (GDI+ / PrintDocument).
#
# Ham ZPL/TSPL yolunun aksine yazıcının komut dilini bilmeyi gerektirmez:
# sürücüsü kurulu her yazıcıda çalışır, gerçek TrueType font ve gerçek kalın
# yazı verir, Türkçe karakter için kod sayfası çevirisi gerekmez.
#
# Parametreler ortam değişkeniyle gelir; yazıcı adındaki tırnak/boşluk
# komut satırını bozmasın diye.
#   VEGA_ETIKET_YAZICI → yazıcı adı (boşsa Windows varsayılan yazıcısı)
#   VEGA_ETIKET_DOSYA  → etiket belgesi (UTF-8 JSON)
#   VEGA_ETIKET_BASLIK → kuyrukta görünecek iş adı (opsiyonel)
#
# Belge biçimi:
#   { genislikMm, yukseklikMm, adet,
#     satirlar: [ { metin, xMm, yMm, boyMm, kalin } ],
#     ayirac:   { xMm, yMm, genislikMm, kalinlikMm } | null }

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$dosya = $env:VEGA_ETIKET_DOSYA
if (-not (Test-Path -LiteralPath $dosya)) { throw "Etiket belgesi bulunamadi: $dosya" }

$ham = [System.IO.File]::ReadAllText($dosya, [System.Text.Encoding]::UTF8)
$script:belge = $ham | ConvertFrom-Json

$doc = New-Object System.Drawing.Printing.PrintDocument

# Yazıcı verilmediyse PrintDocument zaten Windows varsayılanıyla açılır.
$yazici = $env:VEGA_ETIKET_YAZICI
if (-not [string]::IsNullOrWhiteSpace($yazici)) {
  $doc.PrinterSettings.PrinterName = $yazici
}
if (-not $doc.PrinterSettings.IsValid) {
  throw "Yazici bulunamadi veya kullanilamiyor: '$($doc.PrinterSettings.PrinterName)'"
}
$secilenYazici = $doc.PrinterSettings.PrinterName

if ($env:VEGA_ETIKET_BASLIK) { $doc.DocumentName = $env:VEGA_ETIKET_BASLIK }
else { $doc.DocumentName = "Vega Etiket" }

# PaperSize 1/100 inç ister. Etiket ölçüsünü sürücüye bildiriyoruz ki
# sayfayı A4 sanıp etiketi köşeye sıkıştırmasın.
$genislik100 = [int][math]::Round($belge.genislikMm / 25.4 * 100)
$yukseklik100 = [int][math]::Round($belge.yukseklikMm / 25.4 * 100)
$doc.DefaultPageSettings.PaperSize =
  New-Object System.Drawing.Printing.PaperSize("VegaEtiket", $genislik100, $yukseklik100)
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
# Koordinatlar fiziksel sayfa köşesinden başlasın; sürücünün kendi kenar
# boşluğu yerleşimi kaydırmasın.
$doc.OriginAtMargins = $false

$adet = [int]$belge.adet
if ($adet -lt 1) { $adet = 1 }
if ($doc.PrinterSettings.MaximumCopies -gt 0 -and $adet -gt $doc.PrinterSettings.MaximumCopies) {
  $adet = $doc.PrinterSettings.MaximumCopies
}
$doc.PrinterSettings.Copies = $adet

$doc.add_PrintPage({
  param($gonderen, $e)
  $g = $e.Graphics
  $g.PageUnit = [System.Drawing.GraphicsUnit]::Millimeter
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $siyah = [System.Drawing.Brushes]::Black

  # Metni tam verilen noktadan başlat — GDI'nin varsayılan yazı tipi
  # boşluklarını eklemesin, yoksa satırlar aşağı kayar.
  $bicim = [System.Drawing.StringFormat]::GenericTypographic.Clone()
  $bicim.FormatFlags = $bicim.FormatFlags -bor [System.Drawing.StringFormatFlags]::NoWrap

  foreach ($satir in $script:belge.satirlar) {
    $stil = if ($satir.kalin) {
      [System.Drawing.FontStyle]::Bold
    } else {
      [System.Drawing.FontStyle]::Regular
    }
    $font = New-Object System.Drawing.Font(
      "Arial", [single]$satir.boyMm, $stil, [System.Drawing.GraphicsUnit]::Millimeter)
    try {
      $g.DrawString($satir.metin, $font, $siyah,
        [single]$satir.xMm, [single]$satir.yMm, $bicim)
    } finally {
      $font.Dispose()
    }
  }

  $ayirac = $script:belge.ayirac
  if ($ayirac) {
    $g.FillRectangle($siyah,
      [single]$ayirac.xMm, [single]$ayirac.yMm,
      [single]$ayirac.genislikMm, [single]$ayirac.kalinlikMm)
  }

  $e.HasMorePages = $false
})

try {
  $doc.Print()
} finally {
  $doc.Dispose()
}

Write-Output "GONDERILDI $secilenYazici"
