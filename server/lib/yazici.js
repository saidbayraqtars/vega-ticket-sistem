/**
 * Windows yazıcı erişimi — liste ve HAM (RAW) gönderim.
 *
 * Termal etiket yazıcısı ZPL/TSPL komutlarını doğrudan bekler; Windows
 * yazdırma sürücüsünden geçen veri metin olarak basılır. Bu yüzden veri
 * winspool.drv üzerinden RAW olarak spool edilir (scripts/ham-yazdir.ps1).
 *
 * Yerel bir yetenek: WhatsApp'ın aksine merkezî değildir. Etiket yazıcısı
 * hangi bilgisayara bağlıysa etiket orada basılır, ayarı da o bilgisayarın
 * config.json'ında durur.
 */
const os = require("os");
const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");

const HAM_SCRIPT = path.join(__dirname, "..", "scripts", "ham-yazdir.ps1");
const SURUCU_SCRIPT = path.join(__dirname, "..", "scripts", "surucu-yazdir.ps1");
const POWERSHELL = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : "powershell.exe";
const ZAMAN_ASIMI_MS = 20000;

const windowsMu = () => process.platform === "win32";

function psCalistir(argumanlar, ek = {}) {
  return new Promise((cozumle, reddet) => {
    execFile(
      POWERSHELL,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...argumanlar],
      { timeout: ZAMAN_ASIMI_MS, windowsHide: true, env: { ...process.env, ...ek } },
      (err, stdout, stderr) => {
        if (err) {
          const detay = String(stderr || stdout || err.message).trim().split("\n")[0];
          return reddet(new Error(detay || err.message));
        }
        cozumle(String(stdout || "").trim());
      }
    );
  });
}

/** Bu bilgisayarda tanımlı yazıcılar. Varsayılan olan başa alınır. */
async function listele() {
  if (!windowsMu()) return [];
  // Win32_Printer her Windows sürümünde var; Get-Printer ek modül ister.
  const cikti = await psCalistir([
    "-Command",
    "Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline | ConvertTo-Json -Compress",
  ]);
  if (!cikti) return [];
  let ham;
  try {
    ham = JSON.parse(cikti);
  } catch {
    return [];
  }
  const dizi = Array.isArray(ham) ? ham : [ham];
  return dizi
    .filter((y) => y && y.Name)
    .map((y) => ({
      ad: String(y.Name),
      varsayilan: Boolean(y.Default),
      cevrimdisi: Boolean(y.WorkOffline),
    }))
    .sort((a, b) => Number(b.varsayilan) - Number(a.varsayilan) || a.ad.localeCompare(b.ad, "tr"));
}

function geciciYol(uzanti) {
  return path.join(
    os.tmpdir(),
    `vega-etiket-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${uzanti}`
  );
}

/** Geçici dosyayı yazar, betiği çalıştırır, dosyayı her durumda siler. */
async function betikCalistir(script, dosyaIcerigi, uzanti, { yazici, baslik }) {
  if (!windowsMu()) throw new Error("Etiket yazdırma yalnız Windows üzerinde çalışır.");
  const gecici = geciciYol(uzanti);
  await fs.writeFile(gecici, dosyaIcerigi);
  try {
    const cikti = await psCalistir(["-File", script], {
      // Boş bırakılırsa betik Windows varsayılan yazıcısını kullanır.
      VEGA_ETIKET_YAZICI: String(yazici || "").trim(),
      VEGA_ETIKET_DOSYA: gecici,
      VEGA_ETIKET_BASLIK: String(baslik || "Vega Etiket").slice(0, 60),
    });
    if (!/GONDERILDI/.test(cikti)) throw new Error(cikti || "Yazıcı beklenen onayı vermedi.");
    return cikti.replace(/^GONDERILDI\s*/, "").trim();
  } finally {
    await fs.rm(gecici, { force: true }).catch(() => {
      /* geçici dosya silinemezse yazdırma yine de başarılı */
    });
  }
}

/** Ham ZPL/TSPL baytlarını yazıcı kuyruğuna gönderir. */
async function hamGonder(yaziciAdi, veri, baslik = "Vega Etiket") {
  if (!Buffer.isBuffer(veri) || !veri.length) throw new Error("Gönderilecek etiket verisi boş.");
  await betikCalistir(HAM_SCRIPT, veri, "bin", { yazici: yaziciAdi, baslik });
  return { gonderildi: true, yontem: "ham", yazici: String(yaziciAdi || "").trim() || "(varsayılan)", bayt: veri.length };
}

/** Etiket belgesini Windows yazdırma sürücüsünden bastırır. */
async function surucuGonder(yaziciAdi, belge, baslik = "Vega Etiket") {
  if (!belge?.satirlar?.length) throw new Error("Basılacak etiket satırı yok.");
  const json = Buffer.from(JSON.stringify(belge), "utf8");
  const kullanilan = await betikCalistir(SURUCU_SCRIPT, json, "json", { yazici: yaziciAdi, baslik });
  return { gonderildi: true, yontem: "surucu", yazici: kullanilan || String(yaziciAdi || "").trim(), satir: belge.satirlar.length };
}

module.exports = { listele, hamGonder, surucuGonder, windowsMu, HAM_SCRIPT, SURUCU_SCRIPT };
