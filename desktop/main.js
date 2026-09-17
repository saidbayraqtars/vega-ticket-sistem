const { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const { fork } = require("child_process");
const path = require("path");
const http = require("http");

const PORT = parseInt(process.env.VEGA_TICKET_PORT, 10) || 3010;
const gelistirme = !app.isPackaged;

// Paketliyken server extraResources altında; geliştirmede kardeş klasörde.
const serverGirisi = gelistirme
  ? path.join(__dirname, "..", "server", "server.js")
  : path.join(process.resourcesPath, "server", "server.js");

let sunucu = null;
let pencere = null;
const tekOrnek = app.requestSingleInstanceLock();

// WhatsApp ana bilgisayarında ve yazıcısını paylaşan etiket bilgisayarında
// pencere kapanınca uygulama tepside çalışmaya devam eder; kuyruktaki mesajları
// gönderen / etiketleri basan sunucu bu süreçte yaşar. Windows açılışında da
// "--arka-plan" ile gizli başlatılır.
const ARKA_PLAN_ARGUMANI = "--arka-plan";
const arkaPlanBaslangic = process.argv.includes(ARKA_PLAN_ARGUMANI);
// null: sunucu henüz bildirmedi. Gizli açılışta ikisi de bilinmeden kapanılmaz.
const gorevler = { whatsapp: null, etiket: null };
const arkaPlanGorevi = () => Boolean(gorevler.whatsapp || gorevler.etiket);
let gizliBekliyor = arkaPlanBaslangic;
let tepsi = null;
let tepsiBilgisiGosterildi = false;
let bekleyenGuncelleme = null;
const sunucuYenidenBaslatmalari = [];

async function guncellemeSor(bilgi) {
  const sonuc = await dialog.showMessageBox(pencere, {
    type: "info",
    title: "Güncelleme hazır",
    message: `Vega Ticket ${bilgi.version} indirildi.`,
    detail: "Yeni sürümü kurmak için uygulama yeniden başlatılacak.",
    buttons: ["Şimdi yeniden başlat", "Daha sonra"],
    defaultId: 0,
    cancelId: 1,
  });
  if (sonuc.response === 0) autoUpdater.quitAndInstall(false, true);
}

function guncellemeSisteminiKur() {
  if (gelistirme) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", (err) => console.error(`[update] ${err.message}`));
  autoUpdater.on("update-available", (bilgi) => console.log(`[update] ${bilgi.version} indiriliyor`));
  autoUpdater.on("update-not-available", () => console.log("[update] güncel sürüm kullanılıyor"));
  autoUpdater.on("update-downloaded", (bilgi) => {
    // Tepsideyken görünmez pencereye diyalog açılmaz; pencere açılınca sorulur.
    if (pencere?.isVisible()) return guncellemeSor(bilgi);
    bekleyenGuncelleme = bilgi;
    tepsi?.displayBalloon({
      iconType: "info",
      title: "Güncelleme hazır",
      content: `Vega Ticket ${bilgi.version} indirildi. Programı açınca kurulabilir.`,
    });
  });
  setTimeout(() => autoUpdater.checkForUpdates().catch((err) => console.error(`[update] ${err.message}`)), 5000);
}

function sunucuBaslat() {
  sunucu = fork(serverGirisi, [], {
    cwd: path.dirname(serverGirisi),
    env: {
      ...process.env,
      PORT: String(PORT),
      // config.json kullanıcı profiline yazılır; kurulum klasörü yazılabilir olmayabilir
      VEGA_TICKET_BASE_DIR: app.getPath("userData"),
      // Sunucu WhatsApp ana bilgisayarı durumunu IPC ile bildirir.
      VEGA_TICKET_ELECTRON: "1",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  sunucu.stdout?.on("data", (d) => process.stdout.write(`[server] ${d}`));
  sunucu.stderr?.on("data", (d) => process.stderr.write(`[server] ${d}`));
  sunucu.on("message", (mesaj) => {
    if (mesaj?.tip === "whatsapp-ana") gorevDurumuAyarla("whatsapp", Boolean(mesaj.ana));
    if (mesaj?.tip === "etiket-ana") gorevDurumuAyarla("etiket", Boolean(mesaj.ana));
  });
  sunucu.on("exit", (kod) => {
    if (kod === 0 || app.isQuitting) return;
    // Tepsideki ana bilgisayarda kimse hata kutusunu görmez; mesaj gönderimi
    // durmasın diye sunucu kendiliğinden yeniden başlatılır. Sürekli çöküyorsa
    // döngüye girmeden kullanıcıya bildirilir.
    const simdi = Date.now();
    while (sunucuYenidenBaslatmalari.length && simdi - sunucuYenidenBaslatmalari[0] > 10 * 60 * 1000) {
      sunucuYenidenBaslatmalari.shift();
    }
    if (sunucuYenidenBaslatmalari.length < 5) {
      sunucuYenidenBaslatmalari.push(simdi);
      console.error(`[server] ${kod} koduyla kapandı, yeniden başlatılıyor`);
      setTimeout(() => { if (!app.isQuitting) sunucuBaslat(); }, 3000);
      return;
    }
    dialog.showErrorBox("Sunucu durdu", `Arka plan servisi ${kod} koduyla kapandı.`);
  });
}

function gorevDurumuAyarla(gorev, acik) {
  gorevler[gorev] = acik;
  const gerekli = arkaPlanGorevi();
  if (!gelistirme) {
    // Bilgisayar yeniden başlatılsa da mesaj gönderimi / etiket basımı kendiliğinden sürsün.
    app.setLoginItemSettings({ openAtLogin: gerekli, args: [ARKA_PLAN_ARGUMANI] });
  }
  // Windows açılışında gizli başlayıp hiçbir arka plan görevi olmadığı
  // anlaşılan uygulama kapanır.
  const hepsiBildirildi = gorevler.whatsapp !== null && gorevler.etiket !== null;
  if (!gerekli && hepsiBildirildi && gizliBekliyor && !pencere?.isVisible()) {
    app.quit();
    return;
  }
  tepsiDurumunuGuncelle();
}

/** Tepside ve kapatma uyarısında gösterilen görevler. */
function gorevAdlari() {
  return [
    gorevler.whatsapp && { rol: "WhatsApp ana bilgisayarı", etki: "WhatsApp mesajları gönderilmez", surer: "WhatsApp mesajları gönderilmeye" },
    gorevler.etiket && { rol: "etiket bilgisayarı", etki: "diğer bilgisayarlardan gelen etiketler basılmaz", surer: "diğer bilgisayarlardan gelen etiketler basılmaya" },
  ].filter(Boolean);
}

function pencereyiGoster() {
  if (!pencere) return;
  gizliBekliyor = false;
  if (pencere.isMinimized()) pencere.restore();
  pencere.show();
  pencere.focus();
  tepsiDurumunuGuncelle();
  if (bekleyenGuncelleme) {
    const bilgi = bekleyenGuncelleme;
    bekleyenGuncelleme = null;
    guncellemeSor(bilgi);
  }
}

async function tamamenKapat() {
  const adlar = gorevAdlari();
  if (adlar.length) {
    const sonuc = await dialog.showMessageBox({
      type: "warning",
      title: "Vega Ticket kapatılsın mı?",
      message: `Bu bilgisayar ${adlar.map((g) => g.rol).join(" ve ")}.`,
      detail: `Program yeniden açılana kadar ${adlar.map((g) => g.etki).join(", ")}.`,
      buttons: ["Tamamen kapat", "Vazgeç"],
      defaultId: 1,
      cancelId: 1,
    });
    if (sonuc.response !== 0) return;
  }
  app.quit();
}

async function tepsiSimgesi() {
  try {
    return await app.getFileIcon(process.execPath, { size: "small" });
  } catch {
    return nativeImage.createEmpty();
  }
}

let tepsiHazirlaniyor = false;
async function tepsiDurumunuGuncelle() {
  const gerekli = arkaPlanGorevi() || gizliBekliyor;
  if (!gerekli) {
    tepsi?.destroy();
    tepsi = null;
    return;
  }
  if (!tepsi) {
    if (tepsiHazirlaniyor) return;
    tepsiHazirlaniyor = true;
    try {
      tepsi = new Tray(await tepsiSimgesi());
    } finally {
      tepsiHazirlaniyor = false;
    }
    tepsi.setToolTip("Vega Ticket");
    tepsi.on("click", pencereyiGoster);
    tepsi.on("double-click", pencereyiGoster);
  }
  tepsi.setContextMenu(Menu.buildFromTemplate([
    { label: "Vega Ticket'ı aç", click: pencereyiGoster },
    {
      label: gorevler.whatsapp ? "WhatsApp mesajları bu bilgisayardan gönderiliyor" : "WhatsApp ana bilgisayarı değil",
      enabled: false,
    },
    {
      label: gorevler.etiket ? "Diğer bilgisayarların etiketleri bu bilgisayarda basılıyor" : "Etiket yazıcısı paylaşılmıyor",
      enabled: false,
    },
    { type: "separator" },
    { label: "Tamamen kapat", click: tamamenKapat },
  ]));
}

/** Sunucu ayağa kalkana kadar /api/saglik yoklanır. */
function sunucuyuBekle(kalanDeneme = 60) {
  return new Promise((cozumle, reddet) => {
    const dene = () => {
      const istek = http.get(
        { host: "127.0.0.1", port: PORT, path: "/api/saglik", timeout: 1000 },
        (yanit) => {
          yanit.resume();
          cozumle();
        }
      );
      istek.on("error", tekrar);
      istek.on("timeout", () => {
        istek.destroy();
        tekrar();
      });
    };
    const tekrar = () => {
      if (--kalanDeneme <= 0) return reddet(new Error("Sunucu 30 sn içinde yanıt vermedi."));
      setTimeout(dene, 500);
    };
    dene();
  });
}

function pencereOlustur() {
  pencere = new BrowserWindow({
    width: 1560,
    height: 900,
    minWidth: 1100,
    minHeight: 640,
    title: "Vega Ticket Sistem",
    backgroundColor: "#f6f7f9",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  pencere.removeMenu();
  pencere.once("ready-to-show", () => {
    if (!arkaPlanBaslangic) pencere.show();
  });
  pencere.on("close", (olay) => {
    if (app.isQuitting || !arkaPlanGorevi()) return;
    olay.preventDefault();
    pencere.hide();
    gizliBekliyor = true;
    tepsiDurumunuGuncelle();
    if (!tepsiBilgisiGosterildi) {
      tepsiBilgisiGosterildi = true;
      tepsi?.displayBalloon({
        iconType: "info",
        title: "Vega Ticket arka planda çalışıyor",
        content: `${gorevAdlari().map((g) => g.surer).join(", ")} devam edecek. Açmak veya tamamen kapatmak için bu simgeyi kullanın.`
          .replace(/^./, (h) => h.toLocaleUpperCase("tr-TR")),
      });
    }
  });
  // Windows oturumu kapanırken gizleme kapanışı engellemesin.
  pencere.on("session-end", () => { app.isQuitting = true; });

  // Dış bağlantılar varsayılan tarayıcıda açılsın
  pencere.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  pencere.webContents.on("will-navigate", (event, url) => {
    const yerel = `http://127.0.0.1:${PORT}/`;
    if (!url.startsWith(yerel)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  pencere.loadURL(`http://127.0.0.1:${PORT}/`);
}

if (!tekOrnek) {
  app.quit();
} else {
  app.on("second-instance", (_olay, argv) => {
    if (argv.includes(ARKA_PLAN_ARGUMANI)) return;
    pencereyiGoster();
  });

  app.whenReady().then(async () => {
    if (arkaPlanBaslangic) tepsiDurumunuGuncelle();
    sunucuBaslat();
    try {
      await sunucuyuBekle();
    } catch (err) {
      dialog.showErrorBox("Başlatılamadı", err.message);
      app.quit();
      return;
    }
    pencereOlustur();
    guncellemeSisteminiKur();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) pencereOlustur();
    });
  });
}

app.on("before-quit", () => {
  app.isQuitting = true;
  sunucu?.kill();
});

app.on("window-all-closed", () => app.quit());
