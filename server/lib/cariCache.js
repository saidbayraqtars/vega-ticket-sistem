const sql = require("mssql");
const db = require("./db");
const vega = require("./vega");
const arama = require("./arama");
const { telefonKolonlariniSirala, cariTelefonDegeri } = require("./telefon");

/**
 * Cari kartlarını firma bazında belleğe alır.
 * Sebep: 40 bin kartta "Google mantığı" arama (Türkçe normalizasyon + yazım
 * düzeltmesi) SQL tarafında güvenilir yapılamıyor; ayrıca Excel benzeri grid
 * anlık filtre/sıralama istiyor.
 *
 * Tazelik iki katmanlı:
 *   - Kart değişikliği (Vega'da özel kod ANLAŞMALI yazıldı, cari pasife alındı)
 *     ucuz bir imza sorgusuyla IMZA_ARALIGI_MS içinde yakalanır. Önceden yalnız
 *     5 dk TTL vardı; kullanıcı Vega'da değiştirdiği türü programda göremiyordu.
 *   - Dönem bakiyesi hareket tablosundan geldiği için TTL ile tazelenir.
 */
const TTL_MS = 5 * 60 * 1000;
// İmza canlı sunucuda ~100-180 ms; her istekte değil, en çok bu aralıkla bakılır.
const IMZA_ARALIGI_MS = 15 * 1000;
const bellek = new Map(); // firmaNo:donemNo -> { ts, rows, indeks, imza, imzaTs }

async function imzaAl(pool, tablo, telefonKolonlari) {
  const r = await pool.request().query(vega.kartImzasiSorgusu(tablo, telefonKolonlari));
  const satir = r.recordset[0] || {};
  return `${satir.ADET}:${satir.IMZA}`;
}

async function telefonKolonlariAl(pool, tablo) {
  const r = await pool.request().input("tablo", sql.NVarChar, tablo).query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tablo
  `);
  return telefonKolonlariniSirala(r.recordset.map((x) => x.COLUMN_NAME));
}

const kolonAdi = (ad) => "[" + String(ad).replaceAll("]", "]]") + "]";

async function yukle(firmaNo, donemNo) {
  const pool = db.vega();
  if (!pool) throw new Error("Vega bağlantısı yok.");
  const tablo = vega.kartTablosu(firmaNo, "CARI");
  const hareketTablo = vega.hareketTablosu(firmaNo, donemNo, "CARIHAREKETLERI");
  await vega.tabloDogrula(pool, tablo);
  await vega.tabloDogrula(pool, hareketTablo);
  const telefonKolonlari = await telefonKolonlariAl(pool, tablo);

  // İmza kartlardan ÖNCE alınır: arada bir değişiklik olursa sonraki kontrol
  // farkı görüp yeniden yükler, değişiklik kaçmaz.
  const imza = await imzaAl(pool, tablo, telefonKolonlari);
  const telefonSecimi = telefonKolonlari.length
    ? `,\n      ${telefonKolonlari.map((kolon) => `LTRIM(RTRIM(ISNULL(CAST(C.${kolonAdi(kolon)} AS NVARCHAR(1000)),''))) AS ${kolonAdi(kolon)}`).join(",\n      ")}`
    : "";
  const r = await pool.request().query(`
    WITH Bakiye AS (
      SELECT
        H.FIRMANO AS CARIIND,
        ISNULL(SUM(ISNULL(H.BORC,0)),0) AS BORC,
        ISNULL(SUM(ISNULL(H.ALACAK,0)),0) AS ALACAK
      FROM [${hareketTablo}] H
      WHERE ISNULL(H.OZELKOD,'') <> 'KREDIHESABI'
      GROUP BY H.FIRMANO
    )
    SELECT
      C.IND,
      LTRIM(RTRIM(ISNULL(C.FIRMAKODU,''))) AS FIRMAKODU,
      ${vega.AD_IFADESI}                   AS AD,
      LTRIM(RTRIM(ISNULL(C.KOD1,'')))      AS KOD1,
      LTRIM(RTRIM(ISNULL(C.FAKS,'')))      AS FAKS,
      LTRIM(RTRIM(ISNULL(C.YETKILI,'')))   AS YETKILI,
      LTRIM(RTRIM(ISNULL(C.SEHIR,'')))     AS SEHIR,
      LTRIM(RTRIM(ISNULL(C.EMAIL,'')))     AS EMAIL,
      C.KAYITTARIHI,
      ISNULL(B.BORC, 0)                    AS BORC,
      ISNULL(B.ALACAK, 0)                  AS ALACAK,
      ISNULL(B.BORC, 0) - ISNULL(B.ALACAK, 0) AS BAKIYE,
      ISNULL(C.FIRMATIPI, 0)               AS FIRMATIPI
      ${telefonSecimi}
    FROM [${tablo}] C
    LEFT JOIN Bakiye B ON B.CARIIND = C.IND
    WHERE ${vega.CARI_FILTRE}
  `);

  const rows = r.recordset.map((kart) => {
    const telefon = cariTelefonDegeri(kart);
    // Eski istemciler GSM alanını bekliyor; TELEFON yeni ortak gösterim alanı.
    return { ...kart, TELEFON: telefon, GSM: telefon };
  });
  const simdi = Date.now();
  const kayit = { ts: simdi, rows, indeks: arama.indeksOlustur(rows), imza, imzaTs: simdi, telefonKolonlari };
  bellek.set(`${vega.pad4(firmaNo)}:${vega.pad4(donemNo)}`, kayit);
  return kayit;
}

/** Aynı anahtara eşzamanlı gelen istekler tek yüklemeyi paylaşır. */
const bekleyenler = new Map();

function tekYukle(anahtar, firmaNo, donemNo) {
  if (!bekleyenler.has(anahtar)) {
    bekleyenler.set(anahtar, yukle(firmaNo, donemNo).finally(() => bekleyenler.delete(anahtar)));
  }
  return bekleyenler.get(anahtar);
}

async function al(firmaNo, donemNo, { zorla = false } = {}) {
  const anahtar = `${vega.pad4(firmaNo)}:${vega.pad4(donemNo)}`;
  const mevcut = bellek.get(anahtar);
  if (zorla || !mevcut || Date.now() - mevcut.ts >= TTL_MS) return tekYukle(anahtar, firmaNo, donemNo);

  if (Date.now() - mevcut.imzaTs >= IMZA_ARALIGI_MS) {
    try {
      const imza = await imzaAl(db.vega(), vega.kartTablosu(firmaNo, "CARI"), mevcut.telefonKolonlari);
      mevcut.imzaTs = Date.now();
      if (imza !== mevcut.imza) return tekYukle(anahtar, firmaNo, donemNo);
    } catch {
      // İmza alınamazsa eldeki liste gösterilir; TTL yine de tazeler.
    }
  }
  return mevcut;
}

function temizle(firmaNo) {
  if (!firmaNo) return bellek.clear();
  const onEk = `${vega.pad4(firmaNo)}:`;
  for (const anahtar of bellek.keys()) {
    if (anahtar.startsWith(onEk)) bellek.delete(anahtar);
  }
}

module.exports = { al, yukle, temizle, TTL_MS, IMZA_ARALIGI_MS };
