const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const YAZDIRMA_HATALARI = {
  "Invalid printer settings": "Yazıcı bu ayarı kabul etmedi. Yazıcının A5 kâğıdı desteklediğini kontrol edin.",
  "Invalid deviceName provided": "Seçilen yazıcı bu bilgisayarda bulunamadı.",
  "Print job canceled": "Yazdırma iptal edildi.",
  "Print job failed": "Yazıcı işi reddetti. Yazıcının açık ve bağlı olduğunu kontrol edin.",
};
const A5_ZAMAN_ASIMI_MS = 60000;
const A5_EN_FAZLA_KARAKTER = 8_000_000;

/**
 * A5 sayfayı seçilen yazıcıya kâğıt boyutu A5 seçili olarak gönderir.
 * window.print() Electron'da Windows yazdırma penceresini açar: önizleme yoktur
 * ve kâğıt yazıcının varsayılanında (çoğunlukla A4) kalır. Bu yüzden sayfa gizli
 * bir pencereye yüklenir ve kâğıt, yön, kenar boşluğu buradan verilerek basılır.
 */
async function a5Yazdir({ html, yatay, kenarsiz, yazici, kopya }) {
  if (typeof html !== "string" || !html || html.length > A5_EN_FAZLA_KARAKTER) throw new Error("Yazdırılacak sayfa geçersiz.");
  // Logolu sayfa data: adresine sığmayabilir; geçici dosyadan yüklenir.
  const dosya = path.join(app.getPath("temp"), `vega-a5-${process.pid}-${Date.now()}.html`);
  await fs.writeFile(dosya, html, "utf8");
  const gizli = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false },
  });
  try {
    await gizli.loadFile(dosya);
    await new Promise((cozumle, reddet) => {
      const sure = setTimeout(() => reddet(new Error("Yazıcı 60 sn içinde yanıt vermedi.")), A5_ZAMAN_ASIMI_MS);
      gizli.webContents.print({
        silent: true,
        // Boş ad Windows varsayılan yazıcısıdır.
        deviceName: String(yazici || ""),
        pageSize: "A5",
        landscape: Boolean(yatay),
        // "default" sayfanın kendi @page kenar boşluğunu kullanır.
        margins: { marginType: kenarsiz ? "none" : "default" },
        scaleFactor: 100,
        printBackground: true,
        copies: Math.min(Math.max(parseInt(kopya, 10) || 1, 1), 20),
      }, (tamam, neden) => {
        clearTimeout(sure);
        if (tamam) cozumle();
        else reddet(new Error(YAZDIRMA_HATALARI[neden] || neden || "Yazdırılamadı."));
      });
    });
  } finally {
    gizli.destroy();
    await fs.rm(dosya, { force: true }).catch(() => { /* geçici dosya silinemezse de baskı başarılı */ });
  }
}

/** Yalnız kendi arayüzümüzden gelen istekler işlenir. */
const yerelIstek = (olay, port) => Boolean(olay.senderFrame?.url.startsWith(`http://127.0.0.1:${port}/`));

function yazdirmaKanallariniKur(port) {
  // Hata atılırsa arayüze "Error invoking remote method…" öneki gider; sonuç nesnesi döndürülür.
  const sarmala = (islem) => async (olay, istek) => {
    if (!yerelIstek(olay, port)) return { tamam: false, hata: "İstek reddedildi." };
    try {
      return { tamam: true, ...(await islem(olay, istek || {})) };
    } catch (err) {
      return { tamam: false, hata: err.message };
    }
  };
  ipcMain.handle("a5:yazicilar", sarmala(async (olay) => ({
    yazicilar: (await olay.sender.getPrintersAsync()).map((y) => ({ ad: y.name, gorunenAd: y.displayName || y.name })),
  })));
  ipcMain.handle("a5:yazdir", sarmala(async (_olay, istek) => {
    await a5Yazdir(istek);
    return {};
  }));
}

module.exports = { a5Yazdir, yazdirmaKanallariniKur };
