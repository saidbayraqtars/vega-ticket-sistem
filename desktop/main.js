const { app, BrowserWindow, shell, dialog } = require("electron");
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

function guncellemeSisteminiKur() {
  if (gelistirme) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", (err) => console.error(`[update] ${err.message}`));
  autoUpdater.on("update-available", (bilgi) => console.log(`[update] ${bilgi.version} indiriliyor`));
  autoUpdater.on("update-not-available", () => console.log("[update] güncel sürüm kullanılıyor"));
  autoUpdater.on("update-downloaded", async (bilgi) => {
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
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  sunucu.stdout?.on("data", (d) => process.stdout.write(`[server] ${d}`));
  sunucu.stderr?.on("data", (d) => process.stderr.write(`[server] ${d}`));
  sunucu.on("exit", (kod) => {
    if (kod !== 0 && !app.isQuitting) {
      dialog.showErrorBox("Sunucu durdu", `Arka plan servisi ${kod} koduyla kapandı.`);
    }
  });
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
  pencere.once("ready-to-show", () => pencere.show());

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
  app.on("second-instance", () => {
    if (!pencere) return;
    if (pencere.isMinimized()) pencere.restore();
    pencere.focus();
  });

  app.whenReady().then(async () => {
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
