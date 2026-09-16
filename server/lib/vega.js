const sql = require("mssql");

/** Firma/dönem numaralarını 4 haneye sabitler. '101' → '0101' */
const pad4 = (v) => String(v ?? "").trim().padStart(4, "0");

/** Kart (dönemsiz) tablo adı: F0103TBLCARI */
const kartTablosu = (firmaNo, ad) => `F${pad4(firmaNo)}TBL${ad}`;

/** Hareket (dönemli) tablo adı: F0103D0015TBLCARIHAREKETLERI */
const hareketTablosu = (firmaNo, donemNo, ad) => `F${pad4(firmaNo)}D${pad4(donemNo)}TBL${ad}`;

/**
 * Tablo adları sorguya metin olarak gömülmek zorunda (Vega şeması dinamik),
 * bu yüzden her ad kullanılmadan önce şemaya karşı doğrulanır. Ayrıca sadece
 * beklenen desene uyanlar kabul edilir.
 */
const AD_DESENI = /^F\d{4}(D\d{4})?(TBL|VARES|V)[A-Z0-9_]+$/;
const dogrulananlar = new Set();

async function tabloDogrula(pool, tableName) {
  if (!AD_DESENI.test(tableName)) {
    throw new Error(`Geçersiz tablo adı: ${tableName}`);
  }
  const anahtar = `${pool.config.database}::${tableName}`;
  if (dogrulananlar.has(anahtar)) return tableName;

  const r = await pool
    .request()
    .input("tbl", sql.NVarChar, tableName)
    .query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = @tbl AND TABLE_TYPE IN ('BASE TABLE','VIEW')`
    );
  if (r.recordset[0].cnt === 0) {
    throw new Error(`Tablo bulunamadı: ${tableName}`);
  }
  dogrulananlar.add(anahtar);
  return tableName;
}

/** Cari kartlarında ad çözümleme — FIRMAADI boş METİN olabilir, NULL değil. */
const AD_IFADESI = `COALESCE(
  NULLIF(LTRIM(RTRIM(C.FIRMAADI)), ''),
  NULLIF(LTRIM(RTRIM(C.UNVAN)),    ''),
  NULLIF(LTRIM(RTRIM(C.ADI + ' ' + C.SOYADI)), ''),
  NULLIF(LTRIM(RTRIM(C.FIRMAKODU)),''),
  '#' + CAST(C.IND AS NVARCHAR(20))
)`;

/**
 * Her cari sorgusunda uygulanan zorunlu filtreler.
 * Vega'da STATUS 1 = aktif, 2 = pasif. Boş STATUS'lu kartlar e-faturadan
 * otomatik açılmış tedarikçi kartlarıdır (canlıda hepsi FIRMATIPI=2), müşteri
 * listesine girmemeli — bu yüzden "pasif değil" yerine "aktif" aranır.
 */
const CARI_FILTRE = `ISNULL(C.DELETED, 0) = 0 AND C.STATUS = 1 AND C.IND >= 100`;

/**
 * Kart tablosunun değişiklik imzası. Vega'da tür (KOD1), sözleşme tarihi (FAKS)
 * veya aktif/pasif değişince önbellek TTL'yi beklemeden tazelensin diye.
 * GUNCELLEMETARIHI her Vega sürümünde yok; CHECKSUM kolon adından bağımsız.
 */
const kartImzasiSorgusu = (tablo, telefonKolonlari = []) => {
  const kolonAdi = (kolon) => "[" + String(kolon).replaceAll("]", "]]") + "]";
  const telefonlar = telefonKolonlari
    .map((kolon) => `C.${kolonAdi(kolon)}`)
    .join(", ");
  return `
  SELECT COUNT(*) AS ADET,
    CHECKSUM_AGG(CHECKSUM(C.IND, C.FIRMAKODU, C.FIRMAADI, C.UNVAN, C.KOD1, C.FAKS,
      C.STATUS, C.DELETED, C.YETKILI${telefonlar ? `, ${telefonlar}` : ""})) AS IMZA
  FROM [${tablo}] C`;
};

async function firmaDonemListesi(pool) {
  const firmalar = (
    await pool.request().query(
      `SELECT IND, '0' + CAST(IND AS VARCHAR(10)) AS FIRMANO, KISAAD AS FIRMAADI, AD1
       FROM TBLFIRMA ORDER BY IND`
    )
  ).recordset;

  const donemler = (
    await pool.request().query(
      `SELECT FIND, RIGHT('0000' + CAST(IND AS VARCHAR(10)), 4) AS DONEMNO, DONEM
       FROM TBLDONEM ORDER BY FIND, IND DESC`
    )
  ).recordset;

  return {
    firmalar: firmalar.map((f) => ({
      ind: f.IND,
      firmaNo: pad4(f.IND),
      kisaAd: (f.FIRMAADI || "").trim(),
      unvan: (f.AD1 || "").trim(),
      donemler: donemler
        .filter((d) => d.FIND === f.IND)
        .map((d) => ({ donemNo: d.DONEMNO, yil: d.DONEM })),
    })),
  };
}

/** Vega'daki "Tür" (KOD1) açılır liste seçenekleri. */
async function turSecenekleri(pool, firmaNo) {
  const tablo = kartTablosu(firmaNo, "CARIKODTAN");
  try {
    await tabloDogrula(pool, tablo);
  } catch {
    return [];
  }
  const r = await pool
    .request()
    .query(
      `SELECT LTRIM(RTRIM(KOD)) AS kod FROM [${tablo}]
       WHERE CATEGORY = 1 AND LTRIM(RTRIM(ISNULL(KOD,''))) <> '' ORDER BY KOD`
    );
  return r.recordset.map((x) => x.kod);
}

module.exports = {
  pad4,
  kartTablosu,
  hareketTablosu,
  tabloDogrula,
  AD_IFADESI,
  CARI_FILTRE,
  kartImzasiSorgusu,
  firmaDonemListesi,
  turSecenekleri,
};
