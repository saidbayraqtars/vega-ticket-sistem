const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const db = require("./lib/db");
const cfg = require("./lib/config");
const kurulumRoute = require("./routes/kurulum");
const cariRoute = require("./routes/cari");
const ticketRoute = require("./routes/ticket");

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

// Kim işlem yapıyor — Electron her istekte gönderir, yoksa config'teki ad.
app.use((req, res, next) => {
  req.kullanici = String(req.header("x-kullanici") || cfg.readConfig()?.kullanici || "").trim();
  next();
});

// Bağlantı gerektiren uçlar havuz yoksa erken döner. /kurulum ve /saglik
// muaf — Electron açılışta /saglik'i yoklayarak sunucunun ayakta olduğunu
// anlıyor, o yüzden DB kopukken de 200 dönmeli.
app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/kurulum") || req.path === "/saglik") return next();
  if (!db.bagliMi()) {
    return res.status(503).json({ ok: false, baglantiYok: true, mesaj: "Veritabanı bağlantısı yok." });
  }
  next();
});

app.use("/api/kurulum", kurulumRoute);
app.use("/api/cari", cariRoute);
app.use("/api/ticket", ticketRoute);

app.get("/api/saglik", (req, res) => {
  res.json({ ok: true, bagli: db.bagliMi(), kullanici: req.kullanici, surum: require("./package.json").version });
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

async function baslat() {
  const kayitli = cfg.readConfig();
  if (kayitli?.password) {
    try {
      await db.baglan(kayitli);
      console.log(`[db] bağlandı → ${kayitli.server}/${kayitli.database} + ${kayitli.ticketDatabase}`);
    } catch (err) {
      console.error("[db] otomatik bağlantı başarısız:", err.message);
    }
  } else {
    console.log("[db] kayıtlı ayar yok — arayüzden kurulum yapın.");
  }
  app.listen(PORT, "127.0.0.1", () => console.log(`[server] http://127.0.0.1:${PORT}`));
}

process.on("SIGINT", async () => {
  await db.kapat();
  process.exit(0);
});

baslat();

module.exports = app;
