# Windows yazıcı kuyruğuna HAM (RAW) veri gönderir.
#
# Termal etiket yazıcıları ZPL/TSPL komutlarını doğrudan bekler. Windows
# yazdırma sürücüsünden geçirilirse komutlar metin olarak basılır, etiket
# çıkmaz. Bu yüzden winspool.drv üzerinden RAW veri tipiyle spool ediyoruz.
#
# Parametreler ortam değişkeniyle verilir; komut satırına gömülmediği için
# yazıcı adındaki tırnak/boşluk sorun çıkarmaz.
#   VEGA_ETIKET_YAZICI → yazıcı adı
#   VEGA_ETIKET_DOSYA  → gönderilecek ham veri dosyası
#   VEGA_ETIKET_BASLIK → kuyrukta görünecek iş adı (opsiyonel)

$ErrorActionPreference = "Stop"

$yazici = $env:VEGA_ETIKET_YAZICI
$dosya = $env:VEGA_ETIKET_DOSYA
$baslik = if ($env:VEGA_ETIKET_BASLIK) { $env:VEGA_ETIKET_BASLIK } else { "Vega Etiket" }

# Yazıcı verilmediyse Windows varsayılanına gönder.
if ([string]::IsNullOrWhiteSpace($yazici)) {
  Add-Type -AssemblyName System.Drawing
  $gecici = New-Object System.Drawing.Printing.PrintDocument
  try { $yazici = $gecici.PrinterSettings.PrinterName } finally { $gecici.Dispose() }
  if ([string]::IsNullOrWhiteSpace($yazici)) { throw "Windows varsayilan yazicisi bulunamadi." }
}
if (-not (Test-Path -LiteralPath $dosya)) { throw "Veri dosyasi bulunamadi: $dosya" }

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class VegaRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOW {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  static void Patla(string nerede) {
    throw new Exception(nerede + " basarisiz (Win32 hata " + Marshal.GetLastWin32Error() + ")");
  }

  public static int Gonder(string yazici, string baslik, byte[] veri) {
    IntPtr h;
    if (!OpenPrinter(yazici, out h, IntPtr.Zero)) Patla("OpenPrinter");
    try {
      DOCINFOW di = new DOCINFOW();
      di.pDocName = baslik;
      di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) Patla("StartDocPrinter");
      try {
        if (!StartPagePrinter(h)) Patla("StartPagePrinter");
        IntPtr tampon = Marshal.AllocCoTaskMem(veri.Length);
        int yazilan = 0;
        try {
          Marshal.Copy(veri, 0, tampon, veri.Length);
          if (!WritePrinter(h, tampon, veri.Length, out yazilan)) Patla("WritePrinter");
        } finally {
          Marshal.FreeCoTaskMem(tampon);
        }
        EndPagePrinter(h);
        return yazilan;
      } finally {
        EndDocPrinter(h);
      }
    } finally {
      ClosePrinter(h);
    }
  }
}
"@

$veri = [System.IO.File]::ReadAllBytes($dosya)
$yazilan = [VegaRawPrinter]::Gonder($yazici, $baslik, $veri)
Write-Output "GONDERILDI $yazici"
