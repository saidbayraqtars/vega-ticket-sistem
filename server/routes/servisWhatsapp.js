const express = require("express");
const sql = require("mssql");
const db = require("../lib/db");
const cariCache = require("../lib/cariCache");
const worker = require("../lib/whatsappWorker");
const { SURESI_DOLDU, disaAktar } = require("../lib/whatsappBildirim");
const {
  SERVIS_MESAJ_TURLERI,
  TUR_KODLARI,
  VARSAYILAN_SERVIS_SABLONLARI,
  SERVIS_MESAJ_DEGISKENLERI,
  SABLON_ONEKI,
  TEKRAR_KORUMA_SN,
  SERVIS_MESAJ_SUTUNLARI,
  sablonAnahtari,
  servisSablonuDogrula,
  servisMesajiDoldur,
  servisTelefonAdaylari,
  aliciTelefonlari,
} = require("../lib/servisMesaj");
const { tekKayit, gecerliId } = require("./servis");

/**
 * Servis kaydından müşteriye isteğe bağlı WhatsApp mesajı. Mesaj işlem
 * kayıtlarıyla aynı kuyruğa (WHATSAPPMESAJLARI) SERVISID ile girer; ana
 * bilgisayar sırayla gönderir. Hiçbir durum değişikliği kendiliğinden mesaj atmaz.
 */
const router = express.Router();

const kullaniciAdi = (req) => String(req.kullanici || "").trim() || "bilinmiyor";
const turAdi = (kod) => SERVIS_MESAJ_TURLERI.find((t) => t.kod === kod)?.ad || kod;
const metinCevir = (deger) => {
  const metin = String(deger ?? "").trim();
  return metin && metin.length <= 1000 ? metin : null;
};

async function sablonlariAl() {
  const r = await db.ticket().request()
    .input("onek", sql.NVarChar(60), `${SABLON_ONEKI.replace(/_/g, "[_]")}%`)
    .query(`SELECT ANAHTAR, DEGER, GUNCELLEYEN, GUNCELLEMETARIHI FROM dbo.ORTAKAYARLAR WHERE ANAHTAR LIKE @onek`);
  const sablonlar = { ...VARSAYILAN_SERVIS_SABLONLARI };
  const bilgi = {};
  for (const { kod } of SERVIS_MESAJ_TURLERI) {
    const satir = r.recordset.find((x) => x.ANAHTAR === sablonAnahtari(kod));
    // Elle bozulmuş ayar mesajı engellemesin; varsayılan şablon kullanılır.
    if (!satir || !servisSablonuDogrula(satir.DEGER)) continue;
    sablonlar[kod] = satir.DEGER;
    bilgi[kod] = { guncelleyen: satir.GUNCELLEYEN, tarih: satir.GUNCELLEMETARIHI };
  }
  return { sablonlar, bilgi };
}

/** Değişen mesajı ve servis kaydının güncel halini birlikte döner. */
async function mesajYaniti(mesajId) {
  const r = await db.ticket().request().input("id", sql.BigInt, mesajId)
    .query(`SELECT ${SERVIS_MESAJ_SUTUNLARI} FROM dbo.WHATSAPPMESAJLARI WHERE ID = @id AND SERVISID IS NOT NULL`);
  const satir = r.recordset[0];
  if (!satir) return null;
  return { whatsapp: disaAktar(satir), kayit: await tekKayit(satir.SERVISID) };
}

/** Güncelleme satır bulamadıysa nedenini (yok / durumu uygun değil) ayırır. */
async function durumHatasi(res, mesajId, uygunDegil) {
  const yanit = await mesajYaniti(mesajId);
  if (!yanit) return res.status(404).json({ ok: false, mesaj: "WhatsApp mesajı bulunamadı." });
  return res.status(409).json({ ok: false, cakisma: true, mesaj: uygunDegil(yanit.whatsapp), ...yanit });
}

router.get("/whatsapp/sablonlar", async (req, res, next) => {
  try {
    res.json({
      ok: true,
      turler: SERVIS_MESAJ_TURLERI,
      degiskenler: SERVIS_MESAJ_DEGISKENLERI,
      varsayilanlar: VARSAYILAN_SERVIS_SABLONLARI,
      ...(await sablonlariAl()),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/whatsapp/sablonlar", async (req, res, next) => {
  try {
    const tur = String(req.body?.tur || "").toUpperCase();
    if (!TUR_KODLARI.has(tur)) return res.status(400).json({ ok: false, mesaj: "Geçersiz mesaj türü." });
    const sablon = servisSablonuDogrula(req.body?.sablon);
    if (!sablon) {
      return res.status(400).json({
        ok: false,
        mesaj: "Şablon 1-1000 karakter olmalı ve yalnız listelenen değişkenleri kullanmalı.",
      });
    }
    const kullanici = kullaniciAdi(req);
    await db.ticket().request()
      .input("a", sql.NVarChar(60), sablonAnahtari(tur))
      .input("d", sql.NVarChar(sql.MAX), sablon)
      .input("k", sql.NVarChar(60), kullanici).query(`
        MERGE dbo.ORTAKAYARLAR WITH (HOLDLOCK) AS H
        USING (SELECT @a AS ANAHTAR) AS K ON H.ANAHTAR = K.ANAHTAR
        WHEN MATCHED THEN UPDATE SET DEGER = @d, GUNCELLEYEN = @k, GUNCELLEMETARIHI = GETDATE()
        WHEN NOT MATCHED THEN INSERT (ANAHTAR, DEGER, GUNCELLEYEN) VALUES (@a, @d, @k);
      `);
    res.json({ ok: true, tur, sablon, bilgi: { guncelleyen: kullanici, tarih: new Date() } });
  } catch (err) {
    next(err);
  }
});

/** Pencere açılınca: her tür için doldurulmuş metin ve işaretlenebilecek numaralar. */
router.get("/:id/whatsapp/taslak", async (req, res, next) => {
  try {
    const id = gecerliId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const kayit = await tekKayit(id);
    if (!kayit) return res.status(404).json({ ok: false, mesaj: "Servis kaydı bulunamadı." });

    let kart = null;
    let uyari = null;
    try {
      const { rows } = await cariCache.al(kayit.FIRMANO, kayit.DONEMNO);
      kart = rows.find((x) => x.IND === kayit.CARIIND) || null;
      if (!kart) uyari = "Cari kartı Vega'da bulunamadı; yalnız servis kaydındaki telefon listelendi.";
    } catch (err) {
      uyari = `Cari kartı okunamadı (${err.message}); yalnız servis kaydındaki telefon listelendi.`;
    }

    const { sablonlar } = await sablonlariAl();
    const kullanici = kullaniciAdi(req);
    const taslaklar = Object.fromEntries(SERVIS_MESAJ_TURLERI.map(({ kod }) =>
      [kod, servisMesajiDoldur(sablonlar[kod], kayit, { kullanici }) || ""]));
    res.json({ ok: true, taslaklar, telefonlar: servisTelefonAdaylari(kayit, kart), uyari });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/whatsapp", async (req, res, next) => {
  try {
    const id = gecerliId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const tur = String(req.body?.TUR || "GENEL").toUpperCase();
    if (!TUR_KODLARI.has(tur)) return res.status(400).json({ ok: false, mesaj: "Geçersiz mesaj türü." });
    const metin = metinCevir(req.body?.METIN);
    if (!metin) return res.status(400).json({ ok: false, mesaj: "WhatsApp mesajı 1-1000 karakter olmalı." });
    const { hata, telefonlar } = aliciTelefonlari(req.body?.TELEFONLAR);
    if (hata) return res.status(400).json({ ok: false, mesaj: hata });

    const k = await db.ticket().request().input("id", sql.Int, id)
      .query(`SELECT FIRMANO, DONEMNO, CARIIND FROM dbo.SERVISKAYITLARI WHERE ID = @id AND SILINDI = 0`);
    const servis = k.recordset[0];
    if (!servis) return res.status(404).json({ ok: false, mesaj: "Servis kaydı bulunamadı." });

    let yeniId;
    try {
      const r = await db.ticket().request()
        .input("servis", sql.Int, id)
        .input("tur", sql.NVarChar(20), tur)
        .input("firma", sql.NVarChar(4), servis.FIRMANO)
        .input("donem", sql.NVarChar(4), servis.DONEMNO)
        .input("cari", sql.Int, servis.CARIIND)
        .input("telefon", sql.NVarChar(20), telefonlar[0])
        .input("telefonlar", sql.NVarChar(100), telefonlar.join(","))
        .input("metin", sql.NVarChar(1000), metin)
        .input("gonderen", sql.NVarChar(60), kullaniciAdi(req)).query(`
          SET XACT_ABORT ON;
          BEGIN TRAN;
          IF EXISTS (
            SELECT 1 FROM dbo.WHATSAPPMESAJLARI WITH (UPDLOCK, HOLDLOCK)
            WHERE SERVISID = @servis AND METIN = @metin
              AND DURUM IN ('BEKLIYOR','GONDERILIYOR','GONDERILDI')
              AND OLUSTURMATARIHI > DATEADD(SECOND, -${TEKRAR_KORUMA_SN}, GETDATE())
          )
            THROW 51002, N'Aynı mesaj az önce gönderildi.', 1;
          INSERT INTO dbo.WHATSAPPMESAJLARI
            (TICKETID, SERVISID, MESAJTURU, FIRMANO, DONEMNO, CARIIND, TELEFON, TELEFONLAR, METIN, KAYITTARIHI, DURUM, GONDEREN)
          OUTPUT INSERTED.ID
          VALUES (NULL, @servis, @tur, @firma, @donem, @cari, @telefon, @telefonlar, @metin, GETDATE(), 'BEKLIYOR', @gonderen);
          COMMIT;
        `);
      yeniId = r.recordset[0].ID;
    } catch (err) {
      if (err.number === 51002) {
        return res.status(409).json({
          ok: false,
          mesaj: `Aynı mesaj bu kayıttan az önce gönderildi. İkinci kez göndermek için ${TEKRAR_KORUMA_SN / 60} dakika bekleyin veya metni değiştirin.`,
        });
      }
      throw err;
    }
    // Ana bilgisayar bu makineyse bekleme modundaki döngü hemen gönderir.
    worker.uyandir();
    res.status(201).json({ ok: true, ...(await mesajYaniti(yeniId)), mesaj: `“${turAdi(tur)}” mesajı gönderim sırasına alındı.` });
  } catch (err) {
    next(err);
  }
});

/** Henüz gönderilmemiş (sırada, hatalı veya iptal) mesajın metni düzeltilir. */
router.patch("/whatsapp/:mesajId", async (req, res, next) => {
  try {
    const mesajId = gecerliId(req.params.mesajId);
    if (!mesajId) return res.status(400).json({ ok: false, mesaj: "Geçersiz mesaj." });
    const metin = metinCevir(req.body?.METIN);
    if (!metin) return res.status(400).json({ ok: false, mesaj: "WhatsApp mesajı 1-1000 karakter olmalı." });
    // GONDERILIYOR satırı ana bilgisayarın elinde; ona dokunulmaz.
    const r = await db.ticket().request()
      .input("id", sql.BigInt, mesajId)
      .input("metin", sql.NVarChar(1000), metin).query(`
        UPDATE dbo.WHATSAPPMESAJLARI SET METIN = @metin, GUNCELLEMETARIHI = GETDATE()
        WHERE ID = @id AND SERVISID IS NOT NULL AND DURUM IN ('BEKLIYOR','HATA','IPTAL')
      `);
    if (!r.rowsAffected[0]) {
      return durumHatasi(res, mesajId, () => "Mesaj gönderildi veya şu an gönderiliyor; metni artık değiştirilemez.");
    }
    res.json({ ok: true, ...(await mesajYaniti(mesajId)) });
  } catch (err) {
    next(err);
  }
});

/**
 * Gönderilemeyen veya iptal edilen mesajı yeniden sıraya alır. 30 dakikalık
 * pencere yeniden başlar; önceki denemede mesaj ulaşan numaralar atlanır.
 */
router.post("/whatsapp/:mesajId/tekrar", async (req, res, next) => {
  try {
    const mesajId = gecerliId(req.params.mesajId);
    if (!mesajId) return res.status(400).json({ ok: false, mesaj: "Geçersiz mesaj." });
    const metinVar = req.body?.METIN !== undefined;
    const metin = metinVar ? metinCevir(req.body.METIN) : null;
    if (metinVar && !metin) return res.status(400).json({ ok: false, mesaj: "WhatsApp mesajı 1-1000 karakter olmalı." });

    const r = await db.ticket().request()
      .input("id", sql.BigInt, mesajId)
      .input("metin", sql.NVarChar(1000), metin).query(`
        UPDATE dbo.WHATSAPPMESAJLARI SET
          METIN = ISNULL(@metin, METIN), DURUM = 'BEKLIYOR', SONHATA = NULL,
          KAYITTARIHI = GETDATE(), GUNCELLEMETARIHI = GETDATE()
        WHERE ID = @id AND SERVISID IS NOT NULL
          AND (DURUM IN ('HATA','IPTAL') OR (DURUM = 'BEKLIYOR' AND ${SURESI_DOLDU}))
      `);
    if (!r.rowsAffected[0]) {
      return durumHatasi(res, mesajId, (m) => (m.gonderildi
        ? "Bu mesaj zaten gönderildi."
        : "Mesaj zaten gönderim sırasında."));
    }
    worker.uyandir();
    res.json({ ok: true, ...(await mesajYaniti(mesajId)) });
  } catch (err) {
    next(err);
  }
});

/** Sıradaki mesaj ana bilgisayar almadan önce vazgeçilir. */
router.post("/whatsapp/:mesajId/iptal", async (req, res, next) => {
  try {
    const mesajId = gecerliId(req.params.mesajId);
    if (!mesajId) return res.status(400).json({ ok: false, mesaj: "Geçersiz mesaj." });
    const r = await db.ticket().request()
      .input("id", sql.BigInt, mesajId)
      .input("neden", sql.NVarChar(1000), `Gönderim ${kullaniciAdi(req)} tarafından iptal edildi.`).query(`
        UPDATE dbo.WHATSAPPMESAJLARI SET DURUM = 'IPTAL', SONHATA = @neden, GUNCELLEMETARIHI = GETDATE()
        WHERE ID = @id AND SERVISID IS NOT NULL AND DURUM IN ('BEKLIYOR','HATA')
      `);
    if (!r.rowsAffected[0]) {
      return durumHatasi(res, mesajId, (m) => (m.iptal
        ? "Mesaj zaten iptal edilmiş."
        : "Mesaj gönderildi veya şu an gönderiliyor; iptal edilemez."));
    }
    res.json({ ok: true, ...(await mesajYaniti(mesajId)) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
