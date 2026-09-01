const express = require("express");
const sql = require("mssql");
const db = require("../lib/db");
const vega = require("../lib/vega");
const cariCache = require("../lib/cariCache");
const cfg = require("../lib/config");

const router = express.Router();

/** Parola hiçbir zaman istemciye dönmez. */
const guvenliConfig = (c) =>
  c && {
    server: c.server,
    port: c.port,
    instanceName: c.instanceName,
    database: c.database,
    ticketDatabase: c.ticketDatabase,
    username: c.username,
    firmaNo: c.firmaNo,
    donemNo: c.donemNo,
    kullanici: c.kullanici,
    parolaKayitli: Boolean(c.password),
  };

router.get("/durum", (req, res) => {
  const kayitli = cfg.readConfig();
  let iceAktarilabilir = null;
  try {
    const d = cfg.digerUygulamadanIceAktar();
    if (d) iceAktarilabilir = { kaynak: d.kaynak, server: d.server, username: d.username };
  } catch {
    /* içe aktarma isteğe bağlı */
  }
  res.json({
    ok: true,
    yapilandirildi: Boolean(kayitli?.password),
    bagli: db.bagliMi(),
    config: guvenliConfig(kayitli),
    iceAktarilabilir,
  });
});

/** POST /api/kurulum/iceaktar — vega_sorgu/vega-whatsapp ayarını devral */
router.post("/iceaktar", async (req, res, next) => {
  try {
    const d = cfg.digerUygulamadanIceAktar();
    if (!d) {
      return res
        .status(404)
        .json({ ok: false, mesaj: "Devralınabilecek kayıtlı bir bağlantı bulunamadı." });
    }
    const mevcut = cfg.readConfig() || {};
    const yeni = {
      ...cfg.DEFAULTS,
      ...mevcut,
      server: d.server,
      port: d.port,
      username: d.username,
      password: d.password,
      database: mevcut.database || cfg.DEFAULTS.database,
    };
    await db.baglan(yeni);
    cfg.writeConfig(yeni);
    res.json({ ok: true, kaynak: d.kaynak, config: guvenliConfig(yeni) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/kurulum/test — kaydetmeden bağlantı dener */
router.post("/test", async (req, res) => {
  const b = req.body || {};
  const kayitli = cfg.readConfig();
  const aday = {
    ...cfg.DEFAULTS,
    ...(kayitli || {}),
    ...b,
    // Parola alanı boş bırakıldıysa kayıtlı parolayı kullan
    password: b.password || kayitli?.password || "",
  };
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(db.sqlConfig(aday, aday.database)).connect();
    const r = await pool.request().query("SELECT @@VERSION AS surum, DB_NAME() AS db");
    res.json({ ok: true, surum: r.recordset[0].surum.split("\n")[0], veritabani: r.recordset[0].db });
  } catch (err) {
    res.status(400).json({ ok: false, mesaj: err.message });
  } finally {
    if (pool) await pool.close().catch(() => {});
  }
});

/** POST /api/kurulum/kaydet — ayarları yaz, bağlan, ticket DB'yi kur */
router.post("/kaydet", async (req, res, next) => {
  try {
    const b = req.body || {};
    const kayitli = cfg.readConfig();
    const yeni = {
      ...cfg.DEFAULTS,
      ...(kayitli || {}),
      ...b,
      password: b.password || kayitli?.password || "",
    };
    if (!yeni.password) {
      return res.status(400).json({ ok: false, mesaj: "SQL parolası gerekli." });
    }
    await db.baglan(yeni);
    cfg.writeConfig(yeni);
    cariCache.temizle();
    res.json({ ok: true, config: guvenliConfig(yeni) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/kurulum/firmalar — firma + dönem ağacı */
router.get("/firmalar", async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await vega.firmaDonemListesi(db.vega())) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/kurulum/secim — aktif firma/dönem/kullanıcı */
router.post("/secim", async (req, res, next) => {
  try {
    const b = req.body || {};
    const kayitli = cfg.readConfig();
    if (!kayitli) return res.status(400).json({ ok: false, mesaj: "Önce bağlantı kurun." });
    if (b.kullanici !== undefined && String(b.kullanici).trim().length > 60) {
      return res.status(400).json({ ok: false, mesaj: "Kullanıcı adı en fazla 60 karakter olabilir." });
    }

    const yeni = { ...kayitli };
    if (b.firmaNo) yeni.firmaNo = vega.pad4(b.firmaNo);
    if (b.donemNo) yeni.donemNo = vega.pad4(b.donemNo);
    if (b.kullanici !== undefined) yeni.kullanici = String(b.kullanici).trim();
    cfg.writeConfig(yeni);

    if (yeni.kullanici) {
      await db
        .ticket()
        .request()
        .input("k", sql.NVarChar(60), yeni.kullanici)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.KULLANICILAR WHERE KULLANICIADI = @k)
            INSERT INTO dbo.KULLANICILAR (KULLANICIADI, ADSOYAD) VALUES (@k, @k)
        `);
    }
    res.json({ ok: true, config: guvenliConfig(yeni) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/kurulum/kullanicilar — "Atanan" listesi için */
router.get("/kullanicilar", async (req, res, next) => {
  try {
    const r = await db
      .ticket()
      .request()
      .query(
        `SELECT KULLANICIADI, ADSOYAD FROM dbo.KULLANICILAR WHERE AKTIF = 1 ORDER BY KULLANICIADI`
      );
    res.json({ ok: true, kullanicilar: r.recordset });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
