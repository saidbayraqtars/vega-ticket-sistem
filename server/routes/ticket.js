const express = require("express");
const sql = require("mssql");
const db = require("../lib/db");
const vega = require("../lib/vega");
const cariCache = require("../lib/cariCache");
const { ucretCevir, rvCevir, ayCevir } = require("../lib/ticketKurallari");
const {
  VARSAYILAN_MESAJ_SABLONU,
  bildirimGonder,
  mesajSablonuDoldur,
} = require("../lib/whatsappBildirim");
const whatsappWorker = require("../lib/whatsappWorker");

const router = express.Router();
const DURUMLAR = ["ONAY_BEKLIYOR", "KAPALI"];
const ONCELIKLER = [];
const UCRET_DURUMLARI = ["KAYIT"];
const SUTUNLAR = `ID, FIRMANO, DONEMNO, CARIIND, CARIKODU, CARIADI, BASLIK,
  DURUM, ACILISTARIHI, KAPANISTARIHI, UCRET, WHATSAPPMETNI, ONAYLAYAN,
  ONAYTARIHI, OLUSTURAN, GUNCELLEYEN, GUNCELLEMETARIHI, SILINDI, RV`;
const rvHex = (buf) => (buf ? Buffer.from(buf).toString("hex") : null);
const disaAktar = (r) => ({ ...r, RV: rvHex(r.RV) });
const gecerliNo = (v) => /^\d{1,4}$/.test(String(v ?? "").trim());

/** Patron onayı bekleyen veya onaylanmış işlem kayıtları. */
router.get("/", async (req, res, next) => {
  try {
    const firmaNo = vega.pad4(req.query.firma);
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
    const durum = String(req.query.durum || "KAPALI").trim().toUpperCase();
    if (!DURUMLAR.includes(durum)) {
      return res.status(400).json({ ok: false, mesaj: "Geçersiz işlem durumu." });
    }
    const kosullar = ["SILINDI = 0", "DURUM = @durum", "FIRMANO = @firma"];
    const istek = db.ticket().request()
      .input("firma", sql.NVarChar(4), firmaNo)
      .input("durum", sql.NVarChar(20), durum);
    if (durum === "KAPALI") {
      const ay = req.query.ay ? ayCevir(req.query.ay) : null;
      if (req.query.ay && !ay) {
        return res.status(400).json({ ok: false, mesaj: "Ay filtresi YYYY-AA biçiminde olmalı." });
      }
      if (ay) {
        istek.input("ay", sql.NVarChar(7), ay);
        kosullar.push("KAPANISTARIHI >= CONVERT(date, @ay + '-01', 23)");
        kosullar.push("KAPANISTARIHI < DATEADD(MONTH, 1, CONVERT(date, @ay + '-01', 23))");
      } else {
        kosullar.push("KAPANISTARIHI >= DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)");
        kosullar.push("KAPANISTARIHI < DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))");
      }
    }
    if (req.query.cari) {
      const cari = parseInt(req.query.cari, 10);
      if (!Number.isInteger(cari)) return res.status(400).json({ ok: false, mesaj: "Geçersiz cari." });
      kosullar.push("CARIIND = @cari");
      istek.input("cari", sql.Int, cari);
    }
    const tarihSutunu = durum === "KAPALI" ? "KAPANISTARIHI" : "ACILISTARIHI";
    const r = await istek.query(`
      SELECT TOP ${limit} ${SUTUNLAR},
        (SELECT TOP 1 W.DURUM FROM dbo.WHATSAPPMESAJLARI W WHERE W.TICKETID = dbo.TICKETLER.ID) AS WHATSAPPDURUMU,
        (SELECT TOP 1 W.SONHATA FROM dbo.WHATSAPPMESAJLARI W WHERE W.TICKETID = dbo.TICKETLER.ID) AS WHATSAPPHATA
      FROM dbo.TICKETLER
      WHERE ${kosullar.join(" AND ")}
      ORDER BY ${tarihSutunu} DESC, ID DESC;
      SELECT @@DBTS AS SONRV;
    `);
    res.json({
      ok: true,
      kayitlar: r.recordsets[0].map(disaAktar),
      sonRv: rvHex(r.recordsets[1]?.[0]?.SONRV),
    });
  } catch (err) {
    next(err);
  }
});

/** Çok kullanıcılı onay ekranlarında iki durum arasındaki tüm geçişler. */
router.get("/degisiklikler", async (req, res, next) => {
  try {
    const firmaNo = vega.pad4(req.query.firma);
    const istek = db.ticket().request().input("firma", sql.NVarChar(4), firmaNo);
    let kosul = "FIRMANO = @firma AND (DURUM IN ('ONAY_BEKLIYOR','KAPALI') OR SILINDI = 1)";
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

/** İşlem patron onayına düşer; WhatsApp bildirimi kayıt anında kuyruğa alınır. */
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
    let whatsappSablonu = b.WHATSAPPSABLONU ?? b.WHATSAPPMETNI;
    if (!whatsappSablonu) {
      const ayar = await db.ticket().request().query(`
        SELECT WHATSAPPSABLONU FROM dbo.WHATSAPPMESAJAYARLARI WHERE ID = 1
      `);
      whatsappSablonu = ayar.recordset[0]?.WHATSAPPSABLONU || VARSAYILAN_MESAJ_SABLONU;
    }
    const whatsappMetni = mesajSablonuDoldur(whatsappSablonu, {
      musteri: kart.AD,
      cariKodu: kart.FIRMAKODU,
      islem: baslik,
      ucret,
      tarih: new Date(),
      kullanici,
    });
    if (!whatsappMetni) {
      return res.status(400).json({
        ok: false,
        mesaj: "WhatsApp şablonu 1-1000 karakter olmalı ve yalnız Ayarlar'da listelenen değişkenleri kullanmalı.",
      });
    }

    const r = await db.ticket().request()
      .input("firma", sql.NVarChar(4), firmaNo)
      .input("donem", sql.NVarChar(4), donemNo)
      .input("cari", sql.Int, cariInd)
      .input("carikodu", sql.NVarChar(50), kart.FIRMAKODU ?? null)
      .input("cariadi", sql.NVarChar(255), kart.AD ?? null)
      .input("baslik", sql.NVarChar(200), baslik)
      .input("whatsapp", sql.NVarChar(1000), whatsappMetni)
      .input("ucret", sql.Decimal(18, 2), ucret)
      .input("olusturan", sql.NVarChar(60), kullanici).query(`
        INSERT INTO dbo.TICKETLER
          (FIRMANO, DONEMNO, CARIIND, CARIKODU, CARIADI, BASLIK,
           DURUM, ONCELIK, KAPANISTARIHI, OLUSTURAN, WHATSAPPMETNI,
           UCRET, UCRETDURUMU, SOZLESMEDURUMU)
        OUTPUT ${SUTUNLAR.split(",").map((s) => "INSERTED." + s.trim()).join(", ")}
        VALUES (@firma, @donem, @cari, @carikodu, @cariadi, @baslik,
                'ONAY_BEKLIYOR', 'NORMAL', NULL, @olusturan, @whatsapp,
                @ucret, 'KAYIT', NULL)
      `);
    const kayit = disaAktar(r.recordset[0]);
    await logYaz(kayit.ID, kullanici, null, null, null, "İşlem onay bekleyenlere kaydedildi.");
    // Ticket kalıcı yazıldıktan sonra ortak WhatsApp kuyruğuna alınır. Yalnız
    // seçili ana bilgisayar gönderir; kuyruk sorunu ticket kaydını geri almaz.
    let whatsapp;
    try {
      whatsapp = await bildirimGonder(kart, baslik, {
        ticketId: kayit.ID,
        firmaNo,
        donemNo,
        kayitTarihi: kayit.ACILISTARIHI,
        metin: whatsappMetni,
      });
      // Bu makine ana makineyse bekleme moduna düşmüş döngüyü hemen uyandır;
      // değilse zararsız, döngü kontrol edip geri döner.
      whatsappWorker.uyandir();
    } catch (err) {
      // İşlem kaydı artık kalıcıdır. Kuyruk arızasını tüm isteği başarısız
      // göstermeyerek aynı işlemin yanlışlıkla ikinci kez açılmasını önleriz.
      console.error(`[WhatsApp kuyruk] Ticket ${kayit.ID}: ${err.message}`);
      whatsapp = {
        ticketId: kayit.ID,
        durum: "HATA",
        gonderildi: false,
        sirada: false,
        iptal: false,
        metin: whatsappMetni,
        mesaj: "İşlem kaydedildi; WhatsApp kuyruğuna alınamadı. Tekrar gönderebilirsiniz.",
      };
    }
    res.status(201).json({ ok: true, kayit, whatsapp });
  } catch (err) {
    next(err);
  }
});

/** Onaylanmış kayıtta yalnız yapılan işlem ve söylenen ücret düzenlenebilir. */
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

/**
 * WhatsApp metnini herkes düzenleyebilir. Mesaj henüz gönderilmediyse (sırada
 * veya hatalı) kuyruktaki metin de değişir; gönderildiyse yalnız kayıt güncellenir.
 */
router.patch("/:id/whatsapp", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const metin = String(req.body?.METIN ?? "").trim();
    if (!metin || metin.length > 1000) {
      return res.status(400).json({ ok: false, mesaj: "WhatsApp mesajı 1-1000 karakter olmalı." });
    }
    const kullanici = String(req.kullanici || "").trim() || "bilinmiyor";
    const r = await db.ticket().request()
      .input("id", sql.Int, id)
      .input("metin", sql.NVarChar(1000), metin)
      .input("kullanici", sql.NVarChar(60), kullanici).query(`
        UPDATE dbo.TICKETLER SET WHATSAPPMETNI = @metin, GUNCELLEYEN = @kullanici, GUNCELLEMETARIHI = GETDATE()
        WHERE ID = @id AND SILINDI = 0;
        IF @@ROWCOUNT = 0 THROW 51001, 'İşlem kaydı bulunamadı.', 1;

        -- GONDERILIYOR satırı ana makinenin elinde; ona dokunulmaz.
        UPDATE dbo.WHATSAPPMESAJLARI SET METIN = @metin, GUNCELLEMETARIHI = GETDATE()
        WHERE TICKETID = @id AND DURUM IN ('BEKLIYOR','HATA');

        SELECT ${SUTUNLAR},
          (SELECT TOP 1 W.DURUM FROM dbo.WHATSAPPMESAJLARI W WHERE W.TICKETID = dbo.TICKETLER.ID) AS WHATSAPPDURUMU,
          (SELECT TOP 1 W.SONHATA FROM dbo.WHATSAPPMESAJLARI W WHERE W.TICKETID = dbo.TICKETLER.ID) AS WHATSAPPHATA
        FROM dbo.TICKETLER WHERE ID = @id;
      `);
    const kayit = disaAktar(r.recordset[0]);
    await logYaz(id, kullanici, "WHATSAPPMETNI", null, metin, "WhatsApp mesajı düzenlendi.");
    const gonderildi = ["GONDERILDI", "GONDERILIYOR"].includes(kayit.WHATSAPPDURUMU);
    res.json({
      ok: true,
      kayit,
      mesaj: gonderildi
        ? "Mesaj zaten gönderilmişti; değişiklik yalnız kayda işlendi."
        : "Mesaj güncellendi.",
    });
  } catch (err) {
    if (/İşlem kaydı bulunamadı/.test(err.message)) return res.status(404).json({ ok: false, mesaj: "İşlem kaydı bulunamadı." });
    next(err);
  }
});

/** Patron takibi: çift tıklanan bekleyen işlem tamamlananlara taşınır. */
router.post("/:id/onayla", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ ok: false, mesaj: "Geçersiz işlem kimliği." });
    }
    const kullanici = String(req.kullanici || "").trim() || "bilinmiyor";
    const r = await db.ticket().request()
      .input("id", sql.Int, id)
      .input("kullanici", sql.NVarChar(60), kullanici).query(`
        UPDATE dbo.TICKETLER SET
          DURUM = 'KAPALI', KAPANISTARIHI = GETDATE(),
          ONAYLAYAN = @kullanici, ONAYTARIHI = GETDATE(),
          GUNCELLEYEN = @kullanici, GUNCELLEMETARIHI = GETDATE()
        OUTPUT ${SUTUNLAR.split(",").map((s) => "INSERTED." + s.trim()).join(", ")}
        WHERE ID = @id AND SILINDI = 0 AND DURUM = 'ONAY_BEKLIYOR'
      `);
    if (!r.recordset.length) {
      const mevcut = await db.ticket().request().input("id", sql.Int, id)
        .query("SELECT DURUM, SILINDI FROM dbo.TICKETLER WHERE ID = @id");
      if (!mevcut.recordset.length || mevcut.recordset[0].SILINDI) {
        return res.status(404).json({ ok: false, mesaj: "Onaylanacak işlem bulunamadı." });
      }
      return res.status(409).json({ ok: false, mesaj: "Bu işlem başka bir kullanıcı tarafından zaten onaylandı." });
    }
    await logYaz(id, kullanici, "DURUM", "ONAY_BEKLIYOR", "KAPALI", "İşlem çift tıklamayla tamamlandı.");
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
