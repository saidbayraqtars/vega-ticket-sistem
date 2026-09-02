const express = require("express");
const sql = require("mssql");
const db = require("../lib/db");
const cfg = require("../lib/config");
const etiket = require("../lib/etiket");
const yazici = require("../lib/yazici");

const router = express.Router();

const tarihTR = (deger) => {
  const d = deger instanceof Date ? deger : new Date(deger);
  if (Number.isNaN(d.getTime())) return "";
  const iki = (n) => String(n).padStart(2, "0");
  return `${iki(d.getDate())}.${iki(d.getMonth() + 1)}.${d.getFullYear()}`;
};

/** Etiket ayarı bu bilgisayara özeldir — yazıcı her makinede farklı. */
function ayarOku() {
  return etiket.ayarNormalize(cfg.readConfig()?.etiket || {});
}

function ayarYaz(yeni) {
  const kayitli = cfg.readConfig();
  if (!kayitli) throw new Error("Önce veritabanı bağlantısını kurun.");
  const ayar = etiket.ayarNormalize({ ...(kayitli.etiket || {}), ...yeni });
  cfg.writeConfig({ ...kayitli, etiket: ayar });
  return ayar;
}

/**
 * Etiketi seçili yönteme göre bastırır.
 *   surucu → Windows yazdırma sürücüsü (her yazıcıda çalışır, gerçek font)
 *   ham    → ZPL/TSPL komutları doğrudan kuyruğa
 * Yazıcı adı boşsa Windows varsayılan yazıcısı kullanılır.
 */
async function bastir(modeller, ayar, baslik) {
  if (ayar.yontem === "ham") {
    const { veri } = etiket.coklUret(modeller, ayar);
    return yazici.hamGonder(ayar.yazici, veri, baslik);
  }
  // Sürücü yolunda her etiket ayrı bir yazdırma işi; sayfa ölçüsü etiket
  // başına sürücüye yeniden bildirilmeli.
  const sonuclar = [];
  for (const model of modeller) {
    const { belge } = etiket.belgeUret(model, ayar);
    sonuclar.push(await yazici.surucuGonder(ayar.yazici, belge, baslik));
  }
  return { ...sonuclar[0], is: sonuclar.length };
}

/** Servis kaydı + cihaz satırından etiket modeli üretir. */
function etiketModeli(kayit, cihaz, sira, toplam) {
  return {
    servisNo: kayit.SERVISNO,
    musteri: kayit.CARIADI,
    telefon: kayit.TELEFON,
    cins: cihaz.CINS,
    marka: cihaz.MARKA,
    model: cihaz.MODEL,
    seriNo: cihaz.SERINO,
    ariza: cihaz.ARIZA,
    kabulTarihi: tarihTR(kayit.KABULTARIHI),
    sira: toplam > 1 ? `${sira}/${toplam}` : "",
  };
}

/** Verilen cihaz kimlikleri için etiket modellerini kurar. */
async function modelleriTopla({ servisId, cihazIdler }) {
  const istek = db.ticket().request();
  let kosul;
  if (Array.isArray(cihazIdler) && cihazIdler.length) {
    const yerTutucular = cihazIdler.map((id, i) => {
      istek.input(`c${i}`, sql.Int, id);
      return `@c${i}`;
    });
    kosul = `C.ID IN (${yerTutucular.join(",")})`;
  } else {
    istek.input("servis", sql.Int, servisId);
    kosul = `C.SERVISID = @servis`;
  }

  const r = await istek.query(`
    SELECT C.ID, C.SERVISID, C.SIRA, C.CINS, C.MARKA, C.MODEL, C.SERINO, C.ARIZA,
           S.SERVISNO, S.CARIADI, S.TELEFON, S.KABULTARIHI,
           (SELECT COUNT(*) FROM dbo.CIHAZLAR WHERE SERVISID = C.SERVISID) AS TOPLAM
    FROM dbo.CIHAZLAR C
    JOIN dbo.SERVISKAYITLARI S ON S.ID = C.SERVISID AND S.SILINDI = 0
    WHERE ${kosul}
    ORDER BY C.SERVISID, C.SIRA, C.ID
  `);
  return r.recordset.map((satir) => ({
    cihazId: satir.ID,
    model: etiketModeli(satir, satir, satir.SIRA, Number(satir.TOPLAM || 1)),
  }));
}

router.get("/yazicilar", async (req, res, next) => {
  try {
    res.json({ ok: true, windows: yazici.windowsMu(), yazicilar: await yazici.listele() });
  } catch (err) {
    // Yazıcı listesi alınamazsa ayar ekranı açılabilsin; ad elle de yazılabilir.
    res.json({ ok: true, windows: yazici.windowsMu(), yazicilar: [], mesaj: err.message });
  }
});

router.get("/ayar", (req, res, next) => {
  try {
    res.json({ ok: true, ayar: ayarOku(), varsayilan: etiket.VARSAYILAN, ornek: etiket.ORNEK_ETIKET });
  } catch (err) {
    next(err);
  }
});

router.post("/ayar", (req, res, next) => {
  try {
    res.json({ ok: true, ayar: ayarYaz(req.body || {}) });
  } catch (err) {
    next(err);
  }
});

/** Yazıcıya gitmeden üretilen komutu döndürür — ayar doğrulama ve arıza tespiti. */
router.post("/onizleme", (req, res, next) => {
  try {
    const model = req.body?.etiket && Object.keys(req.body.etiket).length ? req.body.etiket : etiket.ORNEK_ETIKET;
    const istenen = { ...ayarOku(), ...(req.body?.ayar || {}) };
    const { ayar, metin } = etiket.uret(model, istenen);
    const { belge } = etiket.belgeUret(model, istenen);
    // Sürücü yolunda gönderilen şey komut değil belge; ikisini de veriyoruz ki
    // ayar ekranı hangi yolda ne gittiğini gösterebilsin.
    res.json({
      ok: true, ayar, etiket: model, belge,
      metin: ayar.yontem === "ham" ? metin : JSON.stringify(belge, null, 2),
    });
  } catch (err) {
    next(err);
  }
});

/** Örnek etiketi basar — yazıcı, ölçü ve kod sayfası ayarını doğrulamak için. */
router.post("/dene", async (req, res, next) => {
  try {
    const ayar = etiket.ayarNormalize({ ...ayarOku(), ...(req.body?.ayar || {}) });
    res.json({ ok: true, sonuc: await bastir([etiket.ORNEK_ETIKET], ayar, "Vega Etiket Deneme") });
  } catch (err) {
    res.status(500).json({ ok: false, mesaj: err.message });
  }
});

/**
 * Yazıcının hangi komut dilini konuştuğu belli değilse: aynı örneği önce ZPL
 * sonra TSPL olarak gönderir. Düzgün çıkan etiket hangisiyse dil odur; diğeri
 * ya boş çıkar ya da komutları düz metin olarak basar.
 */
router.post("/dil-dene", async (req, res, next) => {
  try {
    const temel = etiket.ayarNormalize({ ...ayarOku(), ...(req.body?.ayar || {}), yontem: "ham" });

    const sonuclar = [];
    for (const dil of ["ZPL", "TSPL"]) {
      const ayar = etiket.ayarNormalize({ ...temel, dil, adet: 1 });
      const { veri } = etiket.uret({ ...etiket.ORNEK_ETIKET, servisNo: `${dil} DENEME` }, ayar);
      try {
        await yazici.hamGonder(ayar.yazici, veri, `Vega Etiket ${dil}`);
        sonuclar.push({ dil, gonderildi: true });
      } catch (err) {
        sonuclar.push({ dil, gonderildi: false, mesaj: err.message });
      }
    }
    res.json({
      ok: sonuclar.some((s) => s.gonderildi),
      sonuclar,
      mesaj: "İki etiket gönderildi. Düzgün çıkan hangisiyse üstündeki dili seçip kaydedin.",
    });
  } catch (err) {
    res.status(500).json({ ok: false, mesaj: err.message });
  }
});

/** POST /api/etiket/bas — servis kaydının veya seçili cihazların etiketleri. */
router.post("/bas", async (req, res, next) => {
  try {
    if (!db.bagliMi()) {
      return res.status(503).json({ ok: false, baglantiYok: true, mesaj: "Veritabanı bağlantısı yok." });
    }
    const ayar = etiket.ayarNormalize({ ...ayarOku(), ...(req.body?.ayar || {}) });

    const servisId = parseInt(req.body?.servisId, 10);
    const cihazIdler = (Array.isArray(req.body?.cihazIdler) ? req.body.cihazIdler : [])
      .map((x) => parseInt(x, 10))
      .filter((x) => Number.isInteger(x) && x > 0)
      .slice(0, 50);
    if (!cihazIdler.length && (!Number.isInteger(servisId) || servisId < 1)) {
      return res.status(400).json({ ok: false, mesaj: "Servis kaydı veya cihaz seçilmedi." });
    }

    const kayitlar = await modelleriTopla({ servisId, cihazIdler });
    if (!kayitlar.length) return res.status(404).json({ ok: false, mesaj: "Etiket basılacak cihaz bulunamadı." });

    const sonuc = await bastir(
      kayitlar.map((k) => k.model),
      ayar,
      `Vega Etiket ${kayitlar[0].model.servisNo}`
    );
    const adet = kayitlar.length;

    // Basım kaydı yazdırmadan SONRA işlenir; yazıcı hatası "basıldı" göstermesin.
    const istek = db.ticket().request();
    const yerTutucular = kayitlar.map((k, i) => {
      istek.input(`c${i}`, sql.Int, k.cihazId);
      return `@c${i}`;
    });
    await istek.input("adet", sql.Int, ayar.adet).query(`
      UPDATE dbo.CIHAZLAR
      SET ETIKETBASILDI = GETDATE(), ETIKETADEDI = ETIKETADEDI + @adet
      WHERE ID IN (${yerTutucular.join(",")})
    `);

    res.json({ ok: true, sonuc, adet, cihazIdler: kayitlar.map((k) => k.cihazId) });
  } catch (err) {
    res.status(500).json({ ok: false, mesaj: err.message });
  }
});

module.exports = router;
module.exports.etiketModeli = etiketModeli;
module.exports.tarihTR = tarihTR;
