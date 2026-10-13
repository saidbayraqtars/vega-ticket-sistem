const fs = require("fs");
const path = require("path");
const { normalizeTelefon } = require("./telefon");

// Electron bu değişkeni kullanıcı profilindeki yazılabilir dizine yönlendirir.
const baseDir = process.env.VEGA_TICKET_BASE_DIR || path.join(__dirname, "..");
const authDir = path.join(baseDir, "whatsapp-auth");
// Durdurma kaydı auth klasöründe durur: uygulama yeniden başlasa (güncelleme,
// Windows açılışı) bile kısıtlı hesaba tekrar bağlanmaya çalışılmaz. Oturum
// sıfırlanınca klasörle birlikte silinir.
const durdurmaDosyasi = path.join(authDir, "durduruldu.json");

// Bu kodlarda yeniden bağlanmak hesabı kurtarmaz, kısıtlamayı ağırlaştırır.
// 403: hesap kısıtlandı/banlandı · 401: oturum telefondan kapatıldı ·
// 440: aynı oturum başka yerde açıldı.
const DURDURAN_KODLAR = {
  401: "WhatsApp oturumu kapatılmış. Oturumu sıfırlayıp QR kodunu yeniden okutun.",
  403: "WhatsApp bu numarayı kısıtladı (403). Otomatik bağlanma durduruldu; telefonda numaranın durumunu kontrol edin, açıldıktan sonra \"Yeniden bağlan\"a basın.",
  440: "WhatsApp oturumu başka bir yerde açıldı (440). İki uygulamanın aynı oturumu kullanmadığından emin olup \"Yeniden bağlan\"a basın.",
};

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
let durdurma;

// Rehberde olmayan numaralara sık "WhatsApp'ta var mı" sorgusu ban sinyalidir.
// Sonuç bellekte tutulur: kayıtlı numara 7 gün, kayıtsız numara 1 gün.
const KAYIT_VAR_MS = 7 * 24 * 60 * 60 * 1000;
const KAYIT_YOK_MS = 24 * 60 * 60 * 1000;
const kayitOnbellek = new Map();

/** Önbellekteki geçerli kayıt; süresi dolmuşsa siler. */
function onbellektenKayit(telefon, simdi = Date.now()) {
  const k = kayitOnbellek.get(telefon);
  if (!k) return null;
  if (simdi - k.zaman >= (k.exists ? KAYIT_VAR_MS : KAYIT_YOK_MS)) {
    kayitOnbellek.delete(telefon);
    return null;
  }
  return k;
}

async function kayitSorgula(telefon) {
  const onbellekte = onbellektenKayit(telefon);
  if (onbellekte) return onbellekte;
  const kayit = await socket.onWhatsApp(telefon);
  if (!Array.isArray(kayit) || !kayit.length) return null;
  const sonuc = { exists: Boolean(kayit[0]?.exists), jid: kayit[0]?.jid || null, zaman: Date.now() };
  kayitOnbellek.set(telefon, sonuc);
  return sonuc;
}

function durdurmaOku() {
  if (durdurma === undefined) {
    try {
      durdurma = JSON.parse(fs.readFileSync(durdurmaDosyasi, "utf8"));
    } catch {
      durdurma = null;
    }
  }
  return durdurma;
}

function durdur(kod) {
  durdurma = { kod, mesaj: DURDURAN_KODLAR[kod], zaman: new Date().toISOString() };
  try {
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(durdurmaDosyasi, JSON.stringify(durdurma));
  } catch { /* bellekteki kayıt bu çalışma için yeterli */ }
}

function durdurmaKaldir() {
  durdurma = null;
  fs.rmSync(durdurmaDosyasi, { force: true });
}

const baileysYukle = () => {
  if (!baileysPromise) baileysPromise = import("@whiskeysockets/baileys");
  return baileysPromise;
};

function durum() {
  const d = durdurmaOku();
  return {
    hazir,
    baslatiliyor,
    qr,
    hata: d ? d.mesaj : hata,
    hesap,
    durduruldu: d ? { kod: d.kod, zaman: d.zaman } : null,
  };
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
  if (hazir || baslatiliyor || socket || durdurmaOku()) return durum();
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
        if ([DisconnectReason.loggedOut, DisconnectReason.forbidden, DisconnectReason.connectionReplaced].includes(kod)) {
          qr = null;
          durdur(kod);
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
    const kayit = await kayitSorgula(temiz);
    if (!kayit) {
      return { gonderildi: false, telefon: temiz, mesaj: "Numaranın WhatsApp kaydı doğrulanamadı." };
    }
    if (!kayit.exists) {
      return { gonderildi: false, telefon: temiz, mesaj: "Bu numara WhatsApp kullanmıyor." };
    }

    const jid = kayit.jid || `${temiz}@s.whatsapp.net`;
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
  deneme = 0;
  // Yeni QR başka bir numarayla okutulabilir; o hesabın sorgusu ayrıdır.
  kayitOnbellek.clear();
  fs.rmSync(authDir, { recursive: true, force: true });
  durdurma = null;
  return baslat();
}

/** 403/440 sonrası kullanıcı numaranın açıldığını doğruladığında; oturum korunur. */
async function yenidenBaglan() {
  oturumNo++;
  if (tekrarTimer) { clearTimeout(tekrarTimer); tekrarTimer = null; }
  socketKapat();
  hazir = false;
  baslatiliyor = false;
  hata = null;
  deneme = 0;
  durdurmaKaldir();
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

module.exports = { KAYIT_VAR_MS, KAYIT_YOK_MS, kayitOnbellek, onbellektenKayit, DURDURAN_KODLAR, durum, baslat, gonder, sifirla, yenidenBaglan, kapat, authDir };
