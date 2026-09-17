const sql = require("mssql");
const db = require("./db");
const cfg = require("./config");
const etiket = require("./etiket");
const yazici = require("./yazici");

/**
 * Termal etiketi bu bilgisayarın yazıcısından basma. Hem arayüzün "Etiket bas"
 * isteği hem de başka bilgisayarlardan kuyruğa gelen işler buradan geçer.
 */

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

/** Verilen cihaz kimlikleri (yoksa servis kaydının tüm cihazları) için etiket modelleri. */
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
    servisId: satir.SERVISID,
    model: etiketModeli(satir, satir, satir.SIRA, Number(satir.TOPLAM || 1)),
  }));
}

/** Basım kaydı yazdırmadan SONRA işlenir; yazıcı hatası "basıldı" göstermesin. */
async function basimKaydet(cihazIdler, adet) {
  if (!cihazIdler.length) return;
  const istek = db.ticket().request();
  const yerTutucular = cihazIdler.map((id, i) => {
    istek.input(`c${i}`, sql.Int, id);
    return `@c${i}`;
  });
  await istek.input("adet", sql.Int, adet).query(`
    UPDATE dbo.CIHAZLAR
    SET ETIKETBASILDI = GETDATE(), ETIKETADEDI = ETIKETADEDI + @adet
    WHERE ID IN (${yerTutucular.join(",")})
  `);
}

module.exports = { tarihTR, ayarOku, bastir, etiketModeli, modelleriTopla, basimKaydet };
