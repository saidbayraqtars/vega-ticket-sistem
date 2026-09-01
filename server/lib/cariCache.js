const db = require("./db");
const vega = require("./vega");
const arama = require("./arama");

/**
 * Cari kartlarını firma bazında belleğe alır.
 * Sebep: 40 bin kartta "Google mantığı" arama (Türkçe normalizasyon + yazım
 * düzeltmesi) SQL tarafında güvenilir yapılamıyor; ayrıca Excel benzeri grid
 * anlık filtre/sıralama istiyor. Kartlar seyrek değişir.
 */
const TTL_MS = 5 * 60 * 1000;
const bellek = new Map(); // firmaNo:donemNo -> { ts, rows, indeks }

async function yukle(firmaNo, donemNo) {
  const pool = db.vega();
  if (!pool) throw new Error("Vega bağlantısı yok.");
  const tablo = vega.kartTablosu(firmaNo, "CARI");
  const hareketTablo = vega.hareketTablosu(firmaNo, donemNo, "CARIHAREKETLERI");
  await vega.tabloDogrula(pool, tablo);
  await vega.tabloDogrula(pool, hareketTablo);

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
      LTRIM(RTRIM(ISNULL(C.TELEFON1,'')))  AS TELEFON1,
      LTRIM(RTRIM(ISNULL(C.YGSM,'')))      AS GSM,
      LTRIM(RTRIM(ISNULL(C.YETKILI,'')))   AS YETKILI,
      LTRIM(RTRIM(ISNULL(C.SEHIR,'')))     AS SEHIR,
      LTRIM(RTRIM(ISNULL(C.EMAIL,'')))     AS EMAIL,
      C.KAYITTARIHI,
      ISNULL(B.BORC, 0)                    AS BORC,
      ISNULL(B.ALACAK, 0)                  AS ALACAK,
      ISNULL(B.BORC, 0) - ISNULL(B.ALACAK, 0) AS BAKIYE,
      ISNULL(C.FIRMATIPI, 0)               AS FIRMATIPI
    FROM [${tablo}] C
    LEFT JOIN Bakiye B ON B.CARIIND = C.IND
    WHERE ${vega.CARI_FILTRE}
  `);

  const rows = r.recordset;
  const kayit = { ts: Date.now(), rows, indeks: arama.indeksOlustur(rows) };
  bellek.set(`${vega.pad4(firmaNo)}:${vega.pad4(donemNo)}`, kayit);
  return kayit;
}

async function al(firmaNo, donemNo, { zorla = false } = {}) {
  const anahtar = `${vega.pad4(firmaNo)}:${vega.pad4(donemNo)}`;
  const mevcut = bellek.get(anahtar);
  if (!zorla && mevcut && Date.now() - mevcut.ts < TTL_MS) return mevcut;
  return yukle(firmaNo, donemNo);
}

function temizle(firmaNo) {
  if (!firmaNo) return bellek.clear();
  const onEk = `${vega.pad4(firmaNo)}:`;
  for (const anahtar of bellek.keys()) {
    if (anahtar.startsWith(onEk)) bellek.delete(anahtar);
  }
}

module.exports = { al, yukle, temizle, TTL_MS };
