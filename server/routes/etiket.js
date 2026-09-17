const express = require("express");
const db = require("../lib/db");
const cfg = require("../lib/config");
const etiket = require("../lib/etiket");
const yazici = require("../lib/yazici");
const { ayarOku, bastir, etiketModeli, modelleriTopla, basimKaydet, tarihTR } = require("../lib/etiketBaski");
const kuyruk = require("../lib/etiketKuyrugu");

const router = express.Router();

function ayarYaz(yeni) {
  const kayitli = cfg.readConfig();
  if (!kayitli) throw new Error("Önce veritabanı bağlantısını kurun.");
  const ayar = etiket.ayarNormalize({ ...(kayitli.etiket || {}), ...yeni });
  cfg.writeConfig({ ...kayitli, etiket: ayar });
  return ayar;
}

const kullaniciAdi = (req) => String(req.kullanici || "").trim() || "bilinmiyor";
const dbYok = (res) => res.status(503).json({ ok: false, baglantiYok: true, mesaj: "Veritabanı bağlantısı yok." });
const gecerliId = (deger) => {
  const id = parseInt(deger, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** Hedef başka bilgisayarsa onun paylaşım bilgisi (çevrim içi mi, yazıcısı, etiket düzeni). */
async function uzakBilgisi(ayar) {
  const hedef = kuyruk.uzakHedef(ayar);
  if (!hedef) return null;
  if (!db.bagliMi()) return { makine: hedef, cevrimici: null, aktif: null, ayar: null };
  return (await kuyruk.paylasilan(hedef)) || { makine: hedef, cevrimici: false, aktif: false, ayar: null };
}

router.get("/yazicilar", async (req, res, next) => {
  try {
    res.json({ ok: true, windows: yazici.windowsMu(), yazicilar: await yazici.listele() });
  } catch (err) {
    // Yazıcı listesi alınamazsa ayar ekranı açılabilsin; ad elle de yazılabilir.
    res.json({ ok: true, windows: yazici.windowsMu(), yazicilar: [], mesaj: err.message });
  }
});

router.get("/ayar", async (req, res, next) => {
  try {
    const ayar = ayarOku();
    res.json({
      ok: true, ayar, makine: kuyruk.MAKINE, uzak: await uzakBilgisi(ayar),
      varsayilan: etiket.VARSAYILAN, ornek: etiket.ORNEK_ETIKET,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/ayar", async (req, res, next) => {
  try {
    const ayar = ayarYaz(req.body || {});
    // Paylaşım kapanınca diğer bilgisayarların listesinden hemen düşsün.
    if (!ayar.paylas && db.bagliMi()) await kuyruk.paylasimiKapat();
    kuyruk.uyandir();
    res.json({ ok: true, ayar, makine: kuyruk.MAKINE, uzak: await uzakBilgisi(ayar) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/etiket/paylasilanlar — yazıcısını açmış bilgisayarlar. */
router.get("/paylasilanlar", async (req, res, next) => {
  try {
    if (!db.bagliMi()) return dbYok(res);
    res.json({ ok: true, makine: kuyruk.MAKINE, yazicilar: await kuyruk.paylasilanlar() });
  } catch (err) {
    next(err);
  }
});

/** GET /api/etiket/paylasilan?makine= — tek etiket bilgisayarı ve önizleme düzeni. */
router.get("/paylasilan", async (req, res, next) => {
  try {
    if (!db.bagliMi()) return dbYok(res);
    const makine = String(req.query.makine || "").trim().slice(0, 128);
    if (!makine) return res.status(400).json({ ok: false, mesaj: "Bilgisayar seçilmedi." });
    const bilgi = await kuyruk.paylasilan(makine);
    if (!bilgi) return res.status(404).json({ ok: false, mesaj: "Bu bilgisayar yazıcı paylaşmıyor." });
    res.json({ ok: true, yazici: bilgi });
  } catch (err) {
    next(err);
  }
});

/** POST /api/etiket/uzak-dene — seçilen etiket bilgisayarına örnek etiket gönderir. */
router.post("/uzak-dene", async (req, res, next) => {
  try {
    if (!db.bagliMi()) return dbYok(res);
    const hedef = String(req.body?.hedefMakine || "").trim().slice(0, 128);
    if (!hedef) return res.status(400).json({ ok: false, mesaj: "Etiket bilgisayarı seçilmedi." });
    if (kuyruk.ayniMakine(hedef, kuyruk.MAKINE)) {
      return res.status(400).json({ ok: false, mesaj: "Bu bilgisayarın kendi yazıcısı için “Deneme bas” kullanın." });
    }
    const is = await kuyruk.isEkle({ hedefMakine: hedef, tur: "DENEME", gonderen: kullaniciAdi(req) });
    res.status(202).json({ ok: true, kuyruk: true, is });
  } catch (err) {
    next(err);
  }
});

/** GET /api/etiket/is/:id — kuyruğa bırakılan baskının durumu. */
router.get("/is/:id", async (req, res, next) => {
  try {
    if (!db.bagliMi()) return dbYok(res);
    const id = gecerliId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, mesaj: "Geçersiz iş." });
    const is = await kuyruk.isDurumu(id);
    if (!is) return res.status(404).json({ ok: false, mesaj: "Baskı işi bulunamadı." });
    res.json({ ok: true, is });
  } catch (err) {
    next(err);
  }
});

/** POST /api/etiket/is/:id/tekrar — basılamayan işi yeniden sıraya alır. */
router.post("/is/:id/tekrar", async (req, res, next) => {
  try {
    if (!db.bagliMi()) return dbYok(res);
    const id = gecerliId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, mesaj: "Geçersiz iş." });
    const { degisti, is } = await kuyruk.isTekrar(id);
    if (!is) return res.status(404).json({ ok: false, mesaj: "Baskı işi bulunamadı." });
    if (!degisti) return res.status(409).json({ ok: false, is, mesaj: is.basildi ? "Etiket zaten basıldı." : "İş zaten sırada." });
    res.json({ ok: true, is });
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
    // ayar ekranı hangi yolda ne gittiğini gösterebilsin. Logo verisi okunur
    // kalsın diye kısaltılır.
    const gosterilen = belge.logo ? { ...belge, logo: { ...belge.logo, veri: `<${belge.logo.veri.length} karakter PNG>` } } : belge;
    const kisaMetin = metin.replace(/(\^GFA,\d+,\d+,\d+,)[0-9A-F]+/, "$1<logo>");
    res.json({
      ok: true, ayar, etiket: model, belge: gosterilen,
      metin: ayar.yontem === "ham" ? kisaMetin : JSON.stringify(gosterilen, null, 2),
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

/**
 * POST /api/etiket/bas — servis kaydının veya seçili cihazların etiketleri.
 * Ayarda başka bilgisayar seçiliyse etiket o bilgisayarın kuyruğuna bırakılır.
 */
router.post("/bas", async (req, res, next) => {
  try {
    if (!db.bagliMi()) return dbYok(res);
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

    const hedef = kuyruk.uzakHedef(ayar);
    if (hedef) {
      const is = await kuyruk.isEkle({
        hedefMakine: hedef,
        servisId: kayitlar[0].servisId,
        cihazIdler: kayitlar.map((k) => k.cihazId),
        gonderen: kullaniciAdi(req),
      });
      return res.status(202).json({ ok: true, kuyruk: true, is, adet: kayitlar.length });
    }

    const sonuc = await bastir(
      kayitlar.map((k) => k.model),
      ayar,
      `Vega Etiket ${kayitlar[0].model.servisNo}`
    );
    const adet = kayitlar.length;
    await basimKaydet(kayitlar.map((k) => k.cihazId), ayar.adet);

    res.json({ ok: true, sonuc, adet, cihazIdler: kayitlar.map((k) => k.cihazId) });
  } catch (err) {
    res.status(500).json({ ok: false, mesaj: err.message });
  }
});

module.exports = router;
module.exports.etiketModeli = etiketModeli;
module.exports.tarihTR = tarihTR;
