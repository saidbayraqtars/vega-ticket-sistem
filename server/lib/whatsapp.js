const fs = require("fs");
const path = require("path");
const { normalizeTelefon } = require("./telefon");

// Electron bu değişkeni kullanıcı profilindeki yazılabilir dizine yönlendirir.
const baseDir = process.env.VEGA_TICKET_BASE_DIR || path.join(__dirname, "..");
const authDir = path.join(baseDir, "whatsapp-auth");

let socket = null;
let hazir = false;
let baslatiliyor = false;
let qr = null;
let hata = null;
let hesap = null;
let tekrarTimer = null;
let deneme = 0;
let oturumNo = 0;
let baileysPromise = null;

const baileysYukle = () => {
  if (!baileysPromise) baileysPromise = import("@whiskeysockets/baileys");
  return baileysPromise;
};

function durum() {
  return { hazir, baslatiliyor, qr, hata, hesap };
}

function tekrarPlanla() {
  if (tekrarTimer) return;
  const bekleme = Math.min(3000 * 2 ** Math.min(deneme, 4), 30000);
  tekrarTimer = setTimeout(() => {
    tekrarTimer = null;
    baslat().catch((err) => { hata = err.message; });
  }, bekleme);
  tekrarTimer.unref?.();
}

function socketKapat() {
  if (!socket) return;
  try { socket.ev.removeAllListeners(); } catch { /* zaten kapalı */ }
  try { socket.end(); } catch { /* zaten kapalı */ }
  socket = null;
}

async function baslat() {
  if (hazir || baslatiliyor || socket) return durum();
  baslatiliyor = true;
  hata = null;
  const buOturum = ++oturumNo;

  try {
    fs.mkdirSync(authDir, { recursive: true });
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
      DisconnectReason,
    } = await baileysYukle();
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    let version;
    try { version = (await fetchLatestBaileysVersion()).version; } catch { /* Baileys varsayılanı */ }

    const yeniSocket = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      browser: ["Vega Ticket", "Chrome", "120.0"],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      logger: sessizLogger(),
    });
    socket = yeniSocket;
    yeniSocket.ev.on("creds.update", saveCreds);
    yeniSocket.ev.on("connection.update", ({ connection, lastDisconnect, qr: yeniQr }) => {
      if (buOturum !== oturumNo) return;
      if (yeniQr) {
        qr = yeniQr;
        hata = null;
      }
      if (connection === "open") {
        hazir = true;
        baslatiliyor = false;
        qr = null;
        hata = null;
        deneme = 0;
        hesap = yeniSocket.user?.id?.split(":")[0] || null;
      }
      if (connection === "close") {
        hazir = false;
        baslatiliyor = false;
        hesap = null;
        if (socket === yeniSocket) socket = null;
        const err = lastDisconnect?.error;
        const kod = err?.output?.statusCode ?? err?.statusCode;
        if (kod === DisconnectReason.loggedOut) {
          hata = "WhatsApp oturumu kapatılmış. Oturumu sıfırlayıp QR kodunu yeniden okutun.";
          qr = null;
          return;
        }
        deneme++;
        hata = "WhatsApp bağlantısı kesildi; yeniden bağlanılıyor.";
        tekrarPlanla();
      }
    });
    baslatiliyor = false;
    return durum();
  } catch (err) {
    if (buOturum === oturumNo) {
      baslatiliyor = false;
      socketKapat();
      hata = err.message;
    }
    return durum();
  }
}

async function gonder(telefon, metin) {
  const temiz = normalizeTelefon(telefon);
  if (!temiz) return { gonderildi: false, mesaj: "Caride geçerli bir cep telefonu bulunamadı." };
  if (!hazir || !socket) return { gonderildi: false, telefon: temiz, mesaj: "WhatsApp bağlı değil." };
  if (socket.ws && socket.ws.isOpen === false) {
    hazir = false;
    socket = null;
    tekrarPlanla();
    return { gonderildi: false, telefon: temiz, mesaj: "WhatsApp bağlantısı kesilmiş." };
  }

  try {
    const kayit = await socket.onWhatsApp(temiz);
    if (!Array.isArray(kayit) || !kayit.length) {
      return { gonderildi: false, telefon: temiz, mesaj: "Numaranın WhatsApp kaydı doğrulanamadı." };
    }
    if (!kayit[0]?.exists) {
      return { gonderildi: false, telefon: temiz, mesaj: "Bu numara WhatsApp kullanmıyor." };
    }

    const jid = kayit[0].jid || `${temiz}@s.whatsapp.net`;
    try {
      await socket.presenceSubscribe(jid);
      await socket.sendPresenceUpdate("composing", jid);
      await new Promise((resolve) => setTimeout(resolve, 700));
      await socket.sendPresenceUpdate("paused", jid);
    } catch { /* yazıyor göstergesi gönderimi engellemez */ }

    const sonuc = await socket.sendMessage(jid, { text: String(metin || "") });
    return { gonderildi: true, telefon: temiz, mesajId: sonuc?.key?.id || null, mesaj: "WhatsApp mesajı gönderildi." };
  } catch (err) {
    return { gonderildi: false, telefon: temiz, mesaj: `WhatsApp gönderilemedi: ${err.message}` };
  }
}

async function sifirla() {
  oturumNo++;
  if (tekrarTimer) { clearTimeout(tekrarTimer); tekrarTimer = null; }
  socketKapat();
  hazir = false;
  baslatiliyor = false;
  qr = null;
  hata = null;
  hesap = null;
  fs.rmSync(authDir, { recursive: true, force: true });
  return baslat();
}

function kapat() {
  oturumNo++;
  if (tekrarTimer) clearTimeout(tekrarTimer);
  tekrarTimer = null;
  socketKapat();
  hazir = false;
  baslatiliyor = false;
}

function sessizLogger() {
  const logger = {
    trace() {}, debug() {}, info() {}, warn() {},
    error: (...args) => console.error("[WhatsApp]", ...args),
    fatal: (...args) => console.error("[WhatsApp]", ...args),
    level: "error",
  };
  logger.child = () => logger;
  return logger;
}

module.exports = { durum, baslat, gonder, sifirla, kapat, authDir };
