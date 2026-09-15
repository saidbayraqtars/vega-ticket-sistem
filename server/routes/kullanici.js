const express = require("express");
const sql = require("mssql");
const db = require("../lib/db");
const cfg = require("../lib/config");
const oturum = require("../lib/oturum");
const { pinGecerliMi, pinHashle, pinDogrula, pinVarMi } = require("../lib/pin");

const router = express.Router();

const adCevir = (deger) => {
  const ad = String(deger ?? "").trim();
  return ad && ad.length <= 60 ? ad : null;
};

async function kullaniciBul(ad) {
  const r = await db.ticket().request().input("k", sql.NVarChar(60), ad).query(`
    SELECT TOP 1 KULLANICIADI, ADSOYAD, PAROLAHASH, AKTIF FROM dbo.KULLANICILAR WHERE KULLANICIADI = @k
  `);
  return r.recordset[0] || null;
}

async function kullaniciGarantile(ad) {
  await db.ticket().request().input("k", sql.NVarChar(60), ad).query(`
    IF NOT EXISTS (SELECT 1 FROM dbo.KULLANICILAR WHERE KULLANICIADI = @k)
      INSERT INTO dbo.KULLANICILAR (KULLANICIADI, ADSOYAD) VALUES (@k, @k)
  `);
}

const kilitMesaji = (ms) => `Çok fazla yanlış PIN. ${Math.ceil(ms / 1000)} sn sonra tekrar deneyin.`;

/**
 * Yanlış deneme kilidiyle PIN kontrolü. Kullanıcının PIN'i yoksa geçer.
 * @returns {{ok: true} | {ok: false, durum: number, govde: object}}
 */
function pinKontrol(kayit, pin) {
  if (!pinVarMi(kayit?.PAROLAHASH)) return { ok: true };
  const kilit = oturum.kilitKalan(kayit.KULLANICIADI);
  if (kilit) return { ok: false, durum: 429, govde: { ok: false, kilitli: true, mesaj: kilitMesaji(kilit) } };
  if (pinDogrula(String(pin ?? ""), kayit.PAROLAHASH)) {
    oturum.hataSifirla(kayit.KULLANICIADI);
    return { ok: true };
  }
  const kalan = oturum.hataKaydet(kayit.KULLANICIADI);
  return {
    ok: false,
    durum: kalan ? 401 : 429,
    govde: { ok: false, kalanDeneme: kalan, mesaj: kalan ? `PIN hatalı. Kalan deneme: ${kalan}.` : kilitMesaji(oturum.KILIT_MS) },
  };
}

/** Giriş ekranındaki kullanıcı listesi; PIN değil yalnız PIN'in varlığı döner. */
router.get("/liste", async (req, res, next) => {
  try {
    const r = await db.ticket().request().query(`
      SELECT KULLANICIADI, ADSOYAD, CASE WHEN PAROLAHASH LIKE 'scrypt$%' THEN 1 ELSE 0 END AS PINVAR
      FROM dbo.KULLANICILAR WHERE AKTIF = 1 ORDER BY KULLANICIADI
    `);
    res.json({
      ok: true,
      kullanicilar: r.recordset.map((x) => ({ kullanici: x.KULLANICIADI, adSoyad: x.ADSOYAD, pinVar: Boolean(x.PINVAR) })),
    });
  } catch (err) {
    next(err);
  }
});

/** Bu bilgisayardaki aktif kullanıcı giriş yapmış mı, PIN'i var mı. */
router.get("/oturum", async (req, res, next) => {
  try {
    const ad = adCevir(req.kullanici);
    const kayit = ad ? await kullaniciBul(ad) : null;
    const pinVar = pinVarMi(kayit?.PAROLAHASH);
    res.json({ ok: true, kullanici: ad, pinVar, girisli: Boolean(req.oturumlu), girisGerekli: pinVar && !req.oturumlu });
  } catch (err) {
    next(err);
  }
});

/** Kullanıcı seçimi / değiştirme. PIN'i olan kullanıcı için PIN zorunlu. */
router.post("/giris", async (req, res, next) => {
  try {
    const ad = adCevir(req.body?.kullanici);
    if (!ad) return res.status(400).json({ ok: false, mesaj: "Kullanıcı adı 1-60 karakter olmalı." });
    const kayit = await kullaniciBul(ad);
    if (kayit && !kayit.AKTIF) return res.status(403).json({ ok: false, mesaj: "Bu kullanıcı pasif." });
    const kontrol = pinKontrol(kayit, req.body?.pin);
    if (!kontrol.ok) return res.status(kontrol.durum).json(kontrol.govde);

    if (!kayit) await kullaniciGarantile(ad);
    const gercekAd = kayit?.KULLANICIADI || ad;
    // Bu bilgisayarın varsayılan kullanıcısı olur; yazılan istekler ve WhatsApp
    // "hangi kullanıcıda açık" bilgisi bu adı kullanır.
    const kayitli = cfg.readConfig();
    if (kayitli && kayitli.kullanici !== gercekAd) cfg.writeConfig({ ...kayitli, kullanici: gercekAd });

    if (req.oturumBelirteci) oturum.oturumKapat(req.oturumBelirteci);
    res.json({ ok: true, kullanici: gercekAd, pinVar: pinVarMi(kayit?.PAROLAHASH), belirtec: oturum.oturumAc(gercekAd) });
  } catch (err) {
    next(err);
  }
});

router.post("/cikis", (req, res) => {
  if (req.oturumBelirteci) oturum.oturumKapat(req.oturumBelirteci);
  res.json({ ok: true });
});

/** PIN belirle / değiştir / kaldır. Mevcut PIN varsa önce o doğrulanır. */
router.post("/pin", async (req, res, next) => {
  try {
    const ad = adCevir(req.kullanici);
    if (!ad) return res.status(400).json({ ok: false, mesaj: "Önce kullanıcı seçin." });
    const yeniPin = req.body?.yeniPin == null || req.body.yeniPin === "" ? null : String(req.body.yeniPin);
    if (yeniPin !== null && !pinGecerliMi(yeniPin)) {
      return res.status(400).json({ ok: false, mesaj: "PIN 4-6 haneli rakamdan oluşmalı." });
    }

    const kayit = await kullaniciBul(ad);
    const kontrol = pinKontrol(kayit, req.body?.mevcutPin);
    if (!kontrol.ok) return res.status(kontrol.durum).json(kontrol.govde);
    if (!kayit) await kullaniciGarantile(ad);

    await db.ticket().request()
      .input("k", sql.NVarChar(60), kayit?.KULLANICIADI || ad)
      .input("hash", sql.NVarChar(200), yeniPin ? pinHashle(yeniPin) : null).query(`
        UPDATE dbo.KULLANICILAR SET PAROLAHASH = @hash, PINGUNCELLEMETARIHI = GETDATE()
        WHERE KULLANICIADI = @k
      `);
    oturum.pinOnbellekTemizle();
    res.json({ ok: true, pinVar: Boolean(yeniPin) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.pinKontrol = pinKontrol;
