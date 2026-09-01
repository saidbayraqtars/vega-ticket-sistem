const express = require("express");
const sql = require("mssql");
const db = require("../lib/db");
const vega = require("../lib/vega");
const cariCache = require("../lib/cariCache");
const { ucretCevir, rvCevir } = require("../lib/ticketKurallari");

const router = express.Router();
const DURUMLAR = ["KAPALI"];
const ONCELIKLER = [];
const UCRET_DURUMLARI = ["KAYIT"];
const SUTUNLAR = `ID, FIRMANO, DONEMNO, CARIIND, CARIKODU, CARIADI, BASLIK,
  KAPANISTARIHI, UCRET, OLUSTURAN, GUNCELLEYEN, GUNCELLEMETARIHI, SILINDI, RV`;
const rvHex = (buf) => (buf ? Buffer.from(buf).toString("hex") : null);
const disaAktar = (r) => ({ ...r, RV: rvHex(r.RV) });
const gecerliNo = (v) => /^\d{1,4}$/.test(String(v ?? "").trim());

/** Yalnız bitmiş işlem kayıtları. */
router.get("/", async (req, res, next) => {
  try {
    const firmaNo = vega.pad4(req.query.firma);
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
    const kosullar = ["SILINDI = 0", "DURUM = 'KAPALI'", "FIRMANO = @firma"];
    const istek = db.ticket().request().input("firma", sql.NVarChar(4), firmaNo);
    if (req.query.cari) {
      const cari = parseInt(req.query.cari, 10);
      if (!Number.isInteger(cari)) return res.status(400).json({ ok: false, mesaj: "Geçersiz cari." });
      kosullar.push("CARIIND = @cari");
      istek.input("cari", sql.Int, cari);
    }
    const r = await istek.query(`
      SELECT TOP ${limit} ${SUTUNLAR}
      FROM dbo.TICKETLER
      WHERE ${kosullar.join(" AND ")}
      ORDER BY KAPANISTARIHI DESC, ID DESC
    `);
    res.json({ ok: true, kayitlar: r.recordset.map(disaAktar) });
  } catch (err) {
    next(err);
  }
});

/** Çok kullanıcılı ekranda yalnız bitmiş/silinmiş kayıt değişiklikleri. */
router.get("/degisiklikler", async (req, res, next) => {
  try {
    const firmaNo = vega.pad4(req.query.firma);
    const istek = db.ticket().request().input("firma", sql.NVarChar(4), firmaNo);
    let kosul = "FIRMANO = @firma AND (DURUM = 'KAPALI' OR SILINDI = 1)";
    if (req.query.sonRv) {
      const rv = rvCevir(req.query.sonRv);
      if (!rv) return res.status(400).json({ ok: false, mesaj: "Geçersiz ROWVERSION." });
      istek.input("rv", sql.VarBinary(8), rv);
      kosul += " AND RV > @rv";
    }
    const r = await istek.query(`SELECT TOP 500 ${SUTUNLAR} FROM dbo.TICKETLER WHERE ${kosul} ORDER BY RV`);
    const kayitlar = r.recordset.map(disaAktar);
    res.json({
      ok: true,
      kayitlar,
      sonRv: kayitlar.length ? kayitlar[kayitlar.length - 1].RV : req.query.sonRv ?? null,
    });
  } catch (err) {
    next(err);
  }
});

/** İşlem eklenince doğrudan tamamlanmış kayıt olur; fatura veya tahsilat üretmez. */
router.post("/", async (req, res, next) => {
  try {
    const b = req.body || {};
    const baslik = String(b.BASLIK || "").trim();
    if (!baslik) return res.status(400).json({ ok: false, mesaj: "Yapılan işlem zorunlu." });
    if (baslik.length > 200) return res.status(400).json({ ok: false, mesaj: "Yapılan işlem en fazla 200 karakter olabilir." });
    if (!/^\d+$/.test(String(b.CARIIND ?? "")) || Number(b.CARIIND) < 1) {
      return res.status(400).json({ ok: false, mesaj: "Cari seçilmedi." });
    }
    if (!gecerliNo(b.FIRMANO) || !gecerliNo(b.DONEMNO)) {
      return res.status(400).json({ ok: false, mesaj: "Firma ve dönem numarası geçersiz." });
    }
    const ucret = ucretCevir(b.UCRET);
    if (ucret === null) return res.status(400).json({ ok: false, mesaj: "Söylenen ücret geçersiz." });

    const firmaNo = vega.pad4(b.FIRMANO);
    const donemNo = vega.pad4(b.DONEMNO);
    const cariInd = parseInt(b.CARIIND, 10);
    const { rows } = await cariCache.al(firmaNo, donemNo);
    const kart = rows.find((x) => x.IND === cariInd);
    if (!kart) return res.status(404).json({ ok: false, mesaj: "Cari bulunamadı." });
    const kullanici = String(req.kullanici || b.OLUSTURAN || "").trim() || "bilinmiyor";

    const r = await db.ticket().request()
      .input("firma", sql.NVarChar(4), firmaNo)
      .input("donem", sql.NVarChar(4), donemNo)
      .input("cari", sql.Int, cariInd)
      .input("carikodu", sql.NVarChar(50), kart.FIRMAKODU ?? null)
      .input("cariadi", sql.NVarChar(255), kart.AD ?? null)
      .input("baslik", sql.NVarChar(200), baslik)
      .input("ucret", sql.Decimal(18, 2), ucret)
      .input("olusturan", sql.NVarChar(60), kullanici).query(`
        INSERT INTO dbo.TICKETLER
          (FIRMANO, DONEMNO, CARIIND, CARIKODU, CARIADI, BASLIK,
           DURUM, ONCELIK, KAPANISTARIHI, OLUSTURAN,
           UCRET, UCRETDURUMU, SOZLESMEDURUMU)
        OUTPUT ${SUTUNLAR.split(",").map((s) => "INSERTED." + s.trim()).join(", ")}
        VALUES (@firma, @donem, @cari, @carikodu, @cariadi, @baslik,
                'KAPALI', 'NORMAL', GETDATE(), @olusturan,
                @ucret, 'KAYIT', NULL)
      `);
    const kayit = disaAktar(r.recordset[0]);
    await logYaz(kayit.ID, kullanici, null, null, null, "Tamamlanan işlem kaydedildi.");
    res.status(201).json({ ok: true, kayit });
  } catch (err) {
    next(err);
  }
});

/** Geçmiş kayıtta yalnız yapılan işlem ve söylenen ücret düzenlenebilir. */
router.patch("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const b = req.body || {};
    const rv = rvCevir(b.RV);
    if (!rv) return res.status(400).json({ ok: false, mesaj: "Geçerli RV zorunlu." });
    const setler = [];
    const istek = db.ticket().request().input("id", sql.Int, id).input("rv", sql.VarBinary(8), rv);
    if (Object.hasOwn(b, "BASLIK")) {
      const baslik = String(b.BASLIK || "").trim();
      if (!baslik || baslik.length > 200) return res.status(400).json({ ok: false, mesaj: "Yapılan işlem 1-200 karakter olmalı." });
      setler.push("BASLIK = @baslik");
      istek.input("baslik", sql.NVarChar(200), baslik);
    }
    if (Object.hasOwn(b, "UCRET")) {
      const ucret = ucretCevir(b.UCRET);
      if (ucret === null) return res.status(400).json({ ok: false, mesaj: "Söylenen ücret geçersiz." });
      setler.push("UCRET = @ucret");
      istek.input("ucret", sql.Decimal(18, 2), ucret);
    }
    if (!setler.length) return res.status(400).json({ ok: false, mesaj: "Yalnız yapılan işlem veya söylenen ücret değiştirilebilir." });
    const kullanici = String(req.kullanici || "").trim() || "bilinmiyor";
    setler.push("GUNCELLEYEN = @kullanici", "GUNCELLEMETARIHI = GETDATE()");
    istek.input("kullanici", sql.NVarChar(60), kullanici);
    const r = await istek.query(`
      UPDATE dbo.TICKETLER SET ${setler.join(", ")}
      OUTPUT ${SUTUNLAR.split(",").map((s) => "INSERTED." + s.trim()).join(", ")}
      WHERE ID = @id AND SILINDI = 0 AND DURUM = 'KAPALI' AND RV = @rv
    `);
    if (!r.recordset.length) {
      const guncel = await db.ticket().request().input("id", sql.Int, id)
        .query(`SELECT ${SUTUNLAR} FROM dbo.TICKETLER WHERE ID = @id`);
      return res.status(409).json({
        ok: false, cakisma: true,
        mesaj: "Bu kaydı başka bir kullanıcı değiştirdi. Güncel hali yüklendi.",
        kayit: guncel.recordset[0] ? disaAktar(guncel.recordset[0]) : null,
      });
    }
    await logYaz(id, kullanici, null, null, null, "Tamamlanan işlem düzenlendi.");
    res.json({ ok: true, kayit: disaAktar(r.recordset[0]) });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const kullanici = String(req.kullanici || "").trim() || "bilinmiyor";
    const r = await db.ticket().request().input("id", sql.Int, id).input("kullanici", sql.NVarChar(60), kullanici).query(`
      UPDATE dbo.TICKETLER SET SILINDI = 1, GUNCELLEYEN = @kullanici, GUNCELLEMETARIHI = GETDATE()
      WHERE ID = @id AND SILINDI = 0
    `);
    if (!r.rowsAffected[0]) return res.status(404).json({ ok: false, mesaj: "İşlem bulunamadı." });
    await logYaz(id, kullanici, "SILINDI", "0", "1", "İşlem kaydı silindi.");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/log", async (req, res, next) => {
  try {
    const r = await db.ticket().request().input("id", sql.Int, parseInt(req.params.id, 10)).query(`
      SELECT TOP 500 ID, TICKETID, TARIH, KULLANICI, ALAN, ESKIDEGER, YENIDEGER, NOTU
      FROM dbo.TICKETLOG WHERE TICKETID = @id ORDER BY TARIH DESC, ID DESC
    `);
    res.json({ ok: true, kayitlar: r.recordset });
  } catch (err) {
    next(err);
  }
});

async function logYaz(ticketId, kullanici, alan, eski, yeni, notu) {
  await db.ticket().request()
    .input("t", sql.Int, ticketId).input("k", sql.NVarChar(60), kullanici)
    .input("a", sql.NVarChar(40), alan)
    .input("e", sql.NVarChar(sql.MAX), eski == null ? null : String(eski))
    .input("y", sql.NVarChar(sql.MAX), yeni == null ? null : String(yeni))
    .input("n", sql.NVarChar(sql.MAX), notu ?? null).query(`
      INSERT INTO dbo.TICKETLOG (TICKETID, KULLANICI, ALAN, ESKIDEGER, YENIDEGER, NOTU)
      VALUES (@t, @k, @a, @e, @y, @n)
    `);
}

module.exports = router;
module.exports.DURUMLAR = DURUMLAR;
module.exports.ONCELIKLER = ONCELIKLER;
module.exports.UCRET_DURUMLARI = UCRET_DURUMLARI;
