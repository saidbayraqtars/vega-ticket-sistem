const express = require("express");
const sql = require("mssql");
const db = require("../lib/db");
const vega = require("../lib/vega");
const cariCache = require("../lib/cariCache");
const { cariTelefonu } = require("../lib/telefon");
const { rvCevir } = require("../lib/ticketKurallari");

const router = express.Router();

const DURUMLAR = ["KABUL", "ISLEMDE", "HAZIR", "TESLIM", "IPTAL"];
const SERVIS_SUTUNLARI = `ID, SERVISNO, FIRMANO, DONEMNO, CARIIND, CARIKODU, CARIADI, TELEFON,
  YETKILI, DURUM, NOTU, KABULTARIHI, TESLIMTARIHI, TESLIMALAN,
  GUNCELLEYEN, GUNCELLEMETARIHI, SILINDI, RV`;
const CIHAZ_SUTUNLARI = `ID, SERVISID, SIRA, CINS, MARKA, MODEL, SERINO, ARIZA, AKSESUAR,
  DURUM, YAPILANISLEM, ETIKETBASILDI, ETIKETADEDI, RV`;

const rvHex = (buf) => (buf ? Buffer.from(buf).toString("hex") : null);
const disaAktar = (r) => ({ ...r, RV: rvHex(r.RV) });
const kirp = (deger, uzunluk) => {
  const metin = String(deger ?? "").trim();
  return metin ? metin.slice(0, uzunluk) : null;
};

/**
 * Gövdeden gelen cihaz satırını doğrular; anlamsız satır atlanır.
 * CINS açılır listenin varsayılanı olduğu için tek başına cihaz sayılmaz —
 * en az marka, model, seri no veya arıza dolu olmalı.
 */
function cihazNormalize(ham) {
  const cihaz = {
    cins: kirp(ham?.CINS ?? ham?.cins, 40),
    marka: kirp(ham?.MARKA ?? ham?.marka, 60),
    model: kirp(ham?.MODEL ?? ham?.model, 60),
    seriNo: kirp(ham?.SERINO ?? ham?.seriNo, 60),
    ariza: kirp(ham?.ARIZA ?? ham?.ariza, 400),
    aksesuar: kirp(ham?.AKSESUAR ?? ham?.aksesuar, 200),
  };
  const dolu = [cihaz.marka, cihaz.model, cihaz.seriNo, cihaz.ariza].some(Boolean);
  return dolu ? cihaz : null;
}

async function cihazlariAl(servisIdler) {
  if (!servisIdler.length) return new Map();
  const istek = db.ticket().request();
  const yerTutucular = servisIdler.map((id, i) => {
    istek.input(`s${i}`, sql.Int, id);
    return `@s${i}`;
  });
  const r = await istek.query(`
    SELECT ${CIHAZ_SUTUNLARI} FROM dbo.CIHAZLAR
    WHERE SERVISID IN (${yerTutucular.join(",")}) ORDER BY SERVISID, SIRA, ID
  `);
  const harita = new Map();
  for (const satir of r.recordset) {
    if (!harita.has(satir.SERVISID)) harita.set(satir.SERVISID, []);
    harita.get(satir.SERVISID).push(disaAktar(satir));
  }
  return harita;
}

/** GET /api/servis — kabul listesi. Varsayılan olarak teslim edilenler gizli. */
router.get("/", async (req, res, next) => {
  try {
    const firmaNo = vega.pad4(req.query.firma);
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    const kosullar = ["SILINDI = 0", "FIRMANO = @firma"];
    const istek = db.ticket().request().input("firma", sql.NVarChar(4), firmaNo);

    if (req.query.durum) {
      const durum = String(req.query.durum).toUpperCase();
      if (!DURUMLAR.includes(durum)) return res.status(400).json({ ok: false, mesaj: "Geçersiz durum." });
      kosullar.push("DURUM = @durum");
      istek.input("durum", sql.NVarChar(20), durum);
    } else if (req.query.tumu !== "1") {
      kosullar.push("DURUM NOT IN ('TESLIM','IPTAL')");
    }
    if (req.query.cari) {
      const cari = parseInt(req.query.cari, 10);
      if (!Number.isInteger(cari)) return res.status(400).json({ ok: false, mesaj: "Geçersiz cari." });
      kosullar.push("CARIIND = @cari");
      istek.input("cari", sql.Int, cari);
    }

    const r = await istek.query(`
      SELECT TOP ${limit} ${SERVIS_SUTUNLARI} FROM dbo.SERVISKAYITLARI
      WHERE ${kosullar.join(" AND ")}
      ORDER BY KABULTARIHI DESC, ID DESC
    `);
    const kayitlar = r.recordset.map(disaAktar);
    const cihazlar = await cihazlariAl(kayitlar.map((k) => k.ID));
    res.json({
      ok: true,
      kayitlar: kayitlar.map((k) => ({ ...k, cihazlar: cihazlar.get(k.ID) || [] })),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/servis/:id — kabul kaydı + cihazları */
router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const r = await db.ticket().request().input("id", sql.Int, id)
      .query(`SELECT ${SERVIS_SUTUNLARI} FROM dbo.SERVISKAYITLARI WHERE ID = @id AND SILINDI = 0`);
    if (!r.recordset.length) return res.status(404).json({ ok: false, mesaj: "Servis kaydı bulunamadı." });
    const kayit = disaAktar(r.recordset[0]);
    const cihazlar = await cihazlariAl([kayit.ID]);
    res.json({ ok: true, kayit: { ...kayit, cihazlar: cihazlar.get(kayit.ID) || [] } });
  } catch (err) {
    next(err);
  }
});

/** POST /api/servis — müşteri cihazıyla geldiğinde kabul kaydı açar. */
router.post("/", async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!/^\d+$/.test(String(b.CARIIND ?? "")) || Number(b.CARIIND) < 1) {
      return res.status(400).json({ ok: false, mesaj: "Müşteri seçilmedi." });
    }
    const cihazlar = (Array.isArray(b.cihazlar) ? b.cihazlar : []).map(cihazNormalize).filter(Boolean);
    if (!cihazlar.length) {
      return res.status(400).json({ ok: false, mesaj: "En az bir cihaz girilmeli." });
    }
    if (cihazlar.length > 20) {
      return res.status(400).json({ ok: false, mesaj: "Tek kabul kaydına en fazla 20 cihaz eklenebilir." });
    }

    const firmaNo = vega.pad4(b.FIRMANO);
    const donemNo = vega.pad4(b.DONEMNO);
    const cariInd = parseInt(b.CARIIND, 10);
    const { rows } = await cariCache.al(firmaNo, donemNo);
    const kart = rows.find((x) => x.IND === cariInd);
    if (!kart) return res.status(404).json({ ok: false, mesaj: "Cari bulunamadı." });
    const kullanici = String(req.kullanici || "").trim() || "bilinmiyor";
    // Telefon elle verilmediyse Vega kartından alınır; etikette bu görünür.
    const telefon = kirp(b.TELEFON, 40) || kart.GSM || kart.TELEFON1 || cariTelefonu(kart) || null;

    const islem = new sql.Transaction(db.ticket());
    await islem.begin();
    try {
      const servisIstek = new sql.Request(islem);
      const r = await servisIstek
        .input("firma", sql.NVarChar(4), firmaNo)
        .input("donem", sql.NVarChar(4), donemNo)
        .input("cari", sql.Int, cariInd)
        .input("carikodu", sql.NVarChar(50), kart.FIRMAKODU ?? null)
        .input("cariadi", sql.NVarChar(255), kart.AD ?? null)
        .input("telefon", sql.NVarChar(40), telefon)
        .input("yetkili", sql.NVarChar(100), kirp(b.YETKILI, 100) || kart.YETKILI || null)
        .input("notu", sql.NVarChar(sql.MAX), kirp(b.NOTU, 4000))
        .input("alan", sql.NVarChar(60), kullanici).query(`
          INSERT INTO dbo.SERVISKAYITLARI
            (FIRMANO, DONEMNO, CARIIND, CARIKODU, CARIADI, TELEFON, YETKILI, NOTU, TESLIMALAN)
          OUTPUT ${SERVIS_SUTUNLARI.split(",").map((s) => "INSERTED." + s.trim()).join(", ")}
          VALUES (@firma, @donem, @cari, @carikodu, @cariadi, @telefon, @yetkili, @notu, @alan)
        `);
      const kayit = disaAktar(r.recordset[0]);

      for (const [i, cihaz] of cihazlar.entries()) {
        await new sql.Request(islem)
          .input("servis", sql.Int, kayit.ID)
          .input("sira", sql.Int, i + 1)
          .input("cins", sql.NVarChar(40), cihaz.cins)
          .input("marka", sql.NVarChar(60), cihaz.marka)
          .input("model", sql.NVarChar(60), cihaz.model)
          .input("serino", sql.NVarChar(60), cihaz.seriNo)
          .input("ariza", sql.NVarChar(400), cihaz.ariza)
          .input("aksesuar", sql.NVarChar(200), cihaz.aksesuar).query(`
            INSERT INTO dbo.CIHAZLAR (SERVISID, SIRA, CINS, MARKA, MODEL, SERINO, ARIZA, AKSESUAR)
            VALUES (@servis, @sira, @cins, @marka, @model, @serino, @ariza, @aksesuar)
          `);
      }
      await islem.commit();

      const eklenen = await cihazlariAl([kayit.ID]);
      res.status(201).json({ ok: true, kayit: { ...kayit, cihazlar: eklenen.get(kayit.ID) || [] } });
    } catch (err) {
      await islem.rollback().catch(() => { /* zaten geri alınmış */ });
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/servis/:id — durum, not ve teslim bilgisi. */
router.patch("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const b = req.body || {};
    const rv = rvCevir(b.RV);
    if (!rv) return res.status(400).json({ ok: false, mesaj: "Geçerli RV zorunlu." });

    const setler = [];
    const istek = db.ticket().request().input("id", sql.Int, id).input("rv", sql.VarBinary(8), rv);
    if (Object.hasOwn(b, "DURUM")) {
      const durum = String(b.DURUM || "").toUpperCase();
      if (!DURUMLAR.includes(durum)) return res.status(400).json({ ok: false, mesaj: "Geçersiz durum." });
      setler.push("DURUM = @durum");
      // Teslim tarihi elle değil, duruma bağlı yazılır; geri alınırsa temizlenir.
      setler.push("TESLIMTARIHI = CASE WHEN @durum = 'TESLIM' THEN GETDATE() ELSE NULL END");
      istek.input("durum", sql.NVarChar(20), durum);
    }
    if (Object.hasOwn(b, "NOTU")) {
      setler.push("NOTU = @notu");
      istek.input("notu", sql.NVarChar(sql.MAX), kirp(b.NOTU, 4000));
    }
    if (Object.hasOwn(b, "YETKILI")) {
      setler.push("YETKILI = @yetkili");
      istek.input("yetkili", sql.NVarChar(100), kirp(b.YETKILI, 100));
    }
    if (Object.hasOwn(b, "TELEFON")) {
      setler.push("TELEFON = @telefon");
      istek.input("telefon", sql.NVarChar(40), kirp(b.TELEFON, 40));
    }
    if (!setler.length) return res.status(400).json({ ok: false, mesaj: "Değiştirilecek alan yok." });

    const kullanici = String(req.kullanici || "").trim() || "bilinmiyor";
    setler.push("GUNCELLEYEN = @kullanici", "GUNCELLEMETARIHI = GETDATE()");
    istek.input("kullanici", sql.NVarChar(60), kullanici);

    const r = await istek.query(`
      UPDATE dbo.SERVISKAYITLARI SET ${setler.join(", ")}
      OUTPUT ${SERVIS_SUTUNLARI.split(",").map((s) => "INSERTED." + s.trim()).join(", ")}
      WHERE ID = @id AND SILINDI = 0 AND RV = @rv
    `);
    if (!r.recordset.length) {
      const guncel = await db.ticket().request().input("id", sql.Int, id)
        .query(`SELECT ${SERVIS_SUTUNLARI} FROM dbo.SERVISKAYITLARI WHERE ID = @id`);
      return res.status(409).json({
        ok: false, cakisma: true,
        mesaj: "Bu kaydı başka bir kullanıcı değiştirdi. Güncel hali yüklendi.",
        kayit: guncel.recordset[0] ? disaAktar(guncel.recordset[0]) : null,
      });
    }
    const kayit = disaAktar(r.recordset[0]);
    const cihazlar = await cihazlariAl([kayit.ID]);
    res.json({ ok: true, kayit: { ...kayit, cihazlar: cihazlar.get(kayit.ID) || [] } });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/servis/cihaz/:id — cihaz bilgisi, arıza notu, yapılan işlem. */
router.patch("/cihaz/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const b = req.body || {};
    const rv = rvCevir(b.RV);
    if (!rv) return res.status(400).json({ ok: false, mesaj: "Geçerli RV zorunlu." });

    const alanlar = [
      ["CINS", "cins", sql.NVarChar(40), 40],
      ["MARKA", "marka", sql.NVarChar(60), 60],
      ["MODEL", "model", sql.NVarChar(60), 60],
      ["SERINO", "serino", sql.NVarChar(60), 60],
      ["ARIZA", "ariza", sql.NVarChar(400), 400],
      ["AKSESUAR", "aksesuar", sql.NVarChar(200), 200],
      ["YAPILANISLEM", "yapilan", sql.NVarChar(400), 400],
    ];
    const setler = [];
    const istek = db.ticket().request().input("id", sql.Int, id).input("rv", sql.VarBinary(8), rv);
    for (const [sutun, ad, tip, uzunluk] of alanlar) {
      if (!Object.hasOwn(b, sutun)) continue;
      setler.push(`${sutun} = @${ad}`);
      istek.input(ad, tip, kirp(b[sutun], uzunluk));
    }
    if (Object.hasOwn(b, "DURUM")) {
      const durum = String(b.DURUM || "").toUpperCase();
      if (!DURUMLAR.includes(durum)) return res.status(400).json({ ok: false, mesaj: "Geçersiz durum." });
      setler.push("DURUM = @durum");
      istek.input("durum", sql.NVarChar(20), durum);
    }
    if (!setler.length) return res.status(400).json({ ok: false, mesaj: "Değiştirilecek alan yok." });

    const r = await istek.query(`
      UPDATE dbo.CIHAZLAR SET ${setler.join(", ")}
      OUTPUT ${CIHAZ_SUTUNLARI.split(",").map((s) => "INSERTED." + s.trim()).join(", ")}
      WHERE ID = @id AND RV = @rv
    `);
    if (!r.recordset.length) {
      return res.status(409).json({ ok: false, cakisma: true, mesaj: "Bu cihazı başka bir kullanıcı değiştirdi." });
    }
    res.json({ ok: true, cihaz: disaAktar(r.recordset[0]) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/servis/:id/cihaz — mevcut kabule sonradan cihaz ekler. */
router.post("/:id/cihaz", async (req, res, next) => {
  try {
    const servisId = parseInt(req.params.id, 10);
    if (!Number.isInteger(servisId) || servisId < 1) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const cihaz = cihazNormalize(req.body);
    if (!cihaz) return res.status(400).json({ ok: false, mesaj: "Cihaz bilgisi boş." });

    const r = await db.ticket().request()
      .input("servis", sql.Int, servisId)
      .input("cins", sql.NVarChar(40), cihaz.cins)
      .input("marka", sql.NVarChar(60), cihaz.marka)
      .input("model", sql.NVarChar(60), cihaz.model)
      .input("serino", sql.NVarChar(60), cihaz.seriNo)
      .input("ariza", sql.NVarChar(400), cihaz.ariza)
      .input("aksesuar", sql.NVarChar(200), cihaz.aksesuar).query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.SERVISKAYITLARI WHERE ID = @servis AND SILINDI = 0)
          THROW 51000, 'Servis kaydı bulunamadı.', 1;

        INSERT INTO dbo.CIHAZLAR (SERVISID, SIRA, CINS, MARKA, MODEL, SERINO, ARIZA, AKSESUAR)
        OUTPUT ${CIHAZ_SUTUNLARI.split(",").map((s) => "INSERTED." + s.trim()).join(", ")}
        SELECT @servis,
          ISNULL((SELECT MAX(SIRA) FROM dbo.CIHAZLAR WHERE SERVISID = @servis), 0) + 1,
          @cins, @marka, @model, @serino, @ariza, @aksesuar
      `);
    res.status(201).json({ ok: true, cihaz: disaAktar(r.recordset[0]) });
  } catch (err) {
    if (/Servis kaydı bulunamadı/.test(err.message)) {
      return res.status(404).json({ ok: false, mesaj: "Servis kaydı bulunamadı." });
    }
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const kullanici = String(req.kullanici || "").trim() || "bilinmiyor";
    const r = await db.ticket().request()
      .input("id", sql.Int, id)
      .input("kullanici", sql.NVarChar(60), kullanici).query(`
        UPDATE dbo.SERVISKAYITLARI
        SET SILINDI = 1, GUNCELLEYEN = @kullanici, GUNCELLEMETARIHI = GETDATE()
        WHERE ID = @id AND SILINDI = 0
      `);
    if (!r.rowsAffected[0]) return res.status(404).json({ ok: false, mesaj: "Servis kaydı bulunamadı." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.DURUMLAR = DURUMLAR;
module.exports.SERVIS_SUTUNLARI = SERVIS_SUTUNLARI;
module.exports.CIHAZ_SUTUNLARI = CIHAZ_SUTUNLARI;
module.exports.disaAktar = disaAktar;
