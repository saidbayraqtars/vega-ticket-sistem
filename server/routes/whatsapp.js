const express = require("express");
const QRCode = require("qrcode");
const sql = require("mssql");
const db = require("../lib/db");
const vega = require("../lib/vega");
const cariCache = require("../lib/cariCache");
const whatsapp = require("../lib/whatsapp");
const worker = require("../lib/whatsappWorker");
const { bildirimGonder, mesajDurumu } = require("../lib/whatsappBildirim");

const router = express.Router();

router.get("/durum", async (req, res, next) => {
  try {
    const durum = await worker.durumAl();
    res.json({
      ok: true,
      ...durum,
      qrGorsel: durum.qr ? await QRCode.toDataURL(durum.qr, { margin: 2, width: 240 }) : null,
      qr: undefined,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/sifirla", async (req, res, next) => {
  try {
    const merkez = await worker.durumAl();
    if (!merkez.buMakineAna) {
      return res.status(403).json({ ok: false, mesaj: "WhatsApp oturumu yalnız ana bilgisayardan sıfırlanabilir." });
    }
    await whatsapp.sifirla();
    worker.uyandir();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/ana-yap", async (req, res, next) => {
  try {
    const durum = await worker.anaMakineYap(req.kullanici);
    res.json({ ok: true, durum });
  } catch (err) {
    next(err);
  }
});

router.get("/mesaj/:ticketId", async (req, res, next) => {
  try {
    const ticketId = parseInt(req.params.ticketId, 10);
    if (!Number.isInteger(ticketId) || ticketId < 1) {
      return res.status(400).json({ ok: false, mesaj: "İşlem kaydı kimliği geçersiz." });
    }
    const sonuc = await mesajDurumu(ticketId);
    if (!sonuc) return res.status(404).json({ ok: false, mesaj: "WhatsApp mesaj kaydı bulunamadı." });
    res.json({ ok: true, whatsapp: sonuc });
  } catch (err) {
    next(err);
  }
});

/** Başarısız bildirimi yeni ticket oluşturmadan tekrar göndermek için. */
router.post("/gonder", async (req, res, next) => {
  try {
    const firmaNo = vega.pad4(req.body?.firma);
    const donemNo = vega.pad4(req.body?.donem);
    const ticketId = parseInt(req.body?.ticketId, 10);
    if (!Number.isInteger(ticketId) || ticketId < 1) {
      return res.status(400).json({ ok: false, mesaj: "İşlem kaydı kimliği geçersiz." });
    }

    // Yaş ve metin istemciden alınmaz. Böylece bilgisayar saati/metin değiştirilip
    // 30 dakikalık gönderim penceresi aşılamaz.
    const t = await db.ticket().request()
      .input("id", sql.Int, ticketId)
      .input("firma", sql.NVarChar(4), firmaNo)
      .input("donem", sql.NVarChar(4), donemNo).query(`
        SELECT TOP 1 ID, CARIIND, BASLIK, KAPANISTARIHI
        FROM dbo.TICKETLER
        WHERE ID = @id AND FIRMANO = @firma AND DONEMNO = @donem
          AND SILINDI = 0 AND DURUM = 'KAPALI'
      `);
    const ticket = t.recordset[0];
    if (!ticket) return res.status(404).json({ ok: false, mesaj: "İşlem kaydı bulunamadı." });

    const { rows } = await cariCache.al(firmaNo, donemNo);
    const kart = rows.find((x) => x.IND === ticket.CARIIND);
    if (!kart) return res.status(404).json({ ok: false, mesaj: "Cari bulunamadı." });
    const sonuc = {
      ...(await bildirimGonder(kart, ticket.BASLIK, {
        ticketId: ticket.ID,
        firmaNo,
        donemNo,
        kayitTarihi: ticket.KAPANISTARIHI,
      })),
    };
    if (sonuc.iptal) return res.status(410).json({ ok: false, iptal: true, whatsapp: sonuc, mesaj: sonuc.mesaj });
    worker.uyandir();
    res.json({ ok: true, whatsapp: sonuc });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
