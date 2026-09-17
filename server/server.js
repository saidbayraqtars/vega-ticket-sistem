const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const db = require("./lib/db");
const cfg = require("./lib/config");
const kurulumRoute = require("./routes/kurulum");
const cariRoute = require("./routes/cari");
const ticketRoute = require("./routes/ticket");
const servisRoute = require("./routes/servis");
const servisWhatsappRoute = require("./routes/servisWhatsapp");
const etiketRoute = require("./routes/etiket");
const whatsappRoute = require("./routes/whatsapp");
const kullaniciRoute = require("./routes/kullanici");
const whatsappWorker = require("./lib/whatsappWorker");
const etiketKuyrugu = require("./lib/etiketKuyrugu");
const oturum = require("./lib/oturum");

const PORT = parseInt(process.env.PORT, 10) || 3010;
const app = express();

const izinliOriginler = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
  "http://127.0.0.1:5180",
  "http://localhost:5180",
]);
app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || izinliOriginler.has(origin));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

// Arayüz Türkçe karakterler başlıkta taşınabilsin diye adı URL-kodlu gönderir.
// Bozuk kodlamada (eski istemci, elle yazılmış "%") ham değer kullanılır.
const basliktanCoz = (deger) => {
  try {
    return decodeURIComponent(deger);
  } catch {
    return deger;
  }
};

// Kim işlem yapıyor — Electron her istekte gönderir, yoksa config'teki ad.
app.use((req, res, next) => {
  const baslik = req.header("x-kullanici");
  req.kullanici = String((baslik && basliktanCoz(baslik)) || cfg.readConfig()?.kullanici || "").trim();
  next();
});

// Bağlantı gerektiren uçlar havuz yoksa erken döner. /kurulum ve /saglik
// muaf — Electron açılışta /saglik'i yoklayarak sunucunun ayakta olduğunu
// anlıyor, o yüzden DB kopukken de 200 dönmeli.
app.use("/api", (req, res, next) => {
  // /etiket muaf: yazıcı seçimi ve deneme baskısı yerel yetenek, DB istemez.
  // Etiket basımı DB gerektirdiği için kontrolü kendi ucunda yapar.
  if (req.path.startsWith("/kurulum") || req.path.startsWith("/etiket") || req.path === "/saglik") return next();
  if (!db.bagliMi()) {
    return res.status(503).json({ ok: false, baglantiYok: true, mesaj: "Veritabanı bağlantısı yok." });
  }
  next();
});

/**
 * İsteğe bağlı PIN girişi. Geçerli oturum belirteci varsa kullanıcı ondan
 * alınır (başlıktaki ad yok sayılır). Belirteç yoksa ve kullanıcının PIN'i
 * tanımlıysa istek reddedilir; arayüz giriş ekranını açar.
 */
const PIN_MUAF = (yol) => yol === "/saglik" || yol === "/kurulum/durum" || yol.startsWith("/kullanici/");
app.use("/api", async (req, res, next) => {
  const belirtec = String(req.header("x-oturum") || "").trim();
  const oturumKullanici = belirtec ? oturum.oturumCoz(belirtec) : null;
  if (oturumKullanici) {
    req.kullanici = oturumKullanici;
    req.oturumlu = true;
    req.oturumBelirteci = belirtec;
    return next();
  }
  if (PIN_MUAF(req.path) || !db.bagliMi() || !req.kullanici) return next();
  try {
    const pinliler = await oturum.pinliKullanicilar();
    if (pinliler.has(oturum.anahtar(req.kullanici))) {
      return res.status(401).json({ ok: false, girisGerekli: true, mesaj: "Bu kullanıcı için PIN ile giriş gerekli." });
    }
    next();
  } catch (err) {
    next(err);
  }
});

app.use("/api/kurulum", kurulumRoute);
app.use("/api/kullanici", kullaniciRoute);
app.use("/api/cari", cariRoute);
app.use("/api/ticket", ticketRoute);
app.use("/api/servis", servisWhatsappRoute);
app.use("/api/servis", servisRoute);
app.use("/api/etiket", etiketRoute);
app.use("/api/whatsapp", whatsappRoute);

app.get("/api/saglik", (req, res) => {
  res.json({ ok: true, bagli: db.bagliMi(), baglaniyor: db.baglaniyorMu(), kullanici: req.kullanici, surum: require("./package.json").version });
});

// Electron/production'da derlenmiş arayüz aynı sunucudan servis edilir
const publicDir = path.join(__dirname, "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(publicDir, "index.html")));
}

app.use((err, req, res, next) => {
  console.error("[hata]", err.message);
  res.status(500).json({ ok: false, mesaj: err.message });
});

/**
 * Veritabanına arka planda bağlanır. Açılışı bloklamaz: SQL sunucusu uzakta
 * veya kapalıysa üç havuzun zaman aşımı toplanıp 45 sn'yi bulabiliyor,
 * Electron ise 30 sn sonra "Sunucu yanıt vermedi" deyip uygulamayı kapatıyordu.
 * Pencere hemen açılsın, bağlantı hazır olunca arayüz kendi tazeler.
 */
async function veritabaninaBaglan() {
  const kayitli = cfg.readConfig();
  if (!kayitli?.password) {
    console.log("[db] kayıtlı ayar yok — arayüzden kurulum yapın.");
    return;
  }
  try {
    await db.baglan(kayitli);
    console.log(`[db] bağlandı → ${kayitli.server}/${kayitli.database} + ${kayitli.ticketDatabase}`);
  } catch (err) {
    console.error("[db] otomatik bağlantı başarısız:", err.message);
  }
}

async function baslat() {
  // Önce dinlemeye başla — /api/saglik anında yanıt versin.
  app.listen(PORT, "127.0.0.1", () => console.log(`[server] http://127.0.0.1:${PORT}`));
  // Ortak ayarda bu bilgisayar ana makineyse QR oturumunu ve DB mesaj kuyruğunu
  // çalıştırır. İstemci makinelerde yerel WhatsApp oturumu hiç açılmaz.
  whatsappWorker.baslat();
  // Yazıcısını paylaşan bilgisayar diğer bilgisayarların etiketlerini basar.
  etiketKuyrugu.baslat();
  await veritabaninaBaglan();
}

process.on("SIGINT", async () => {
  whatsappWorker.kapat();
  etiketKuyrugu.kapat();
  await db.kapat();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  whatsappWorker.kapat();
  etiketKuyrugu.kapat();
  await db.kapat();
  process.exit(0);
});

baslat();

module.exports = app;
