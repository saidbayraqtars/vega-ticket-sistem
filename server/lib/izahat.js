/**
 * TBLCARIHAREKETLERI.IZAHAT belge tipi sözlüğü.
 * IZAHAT nvarchar(12) — metin olarak tutulur, sayı gibi karşılaştırma yapma.
 * Kodlar canlı veriyle doğrulandı (F0103D0015: 83, 104, 103, 21, 13, 20, 84,
 * 11, 19, 22, 23, 18, 27, 32, 33).
 */
const IZAHAT = {
  11: { ad: "Cari Çıkış / Tediye", yon: "BORC", baslik: "TBLCARCIKBASLIK" },
  12: { ad: "Cari Çıkış İade Bordrosu", yon: null, baslik: "TBLCARCIKIADEBASLIK" },
  13: { ad: "Cari Giriş / Tahsilat", yon: "ALACAK", baslik: "TBLCARGIRBASLIK" },
  16: { ad: "Çek Ödeme", yon: "BORC", baslik: null },
  18: { ad: "Alınan Çek Bordrosu", yon: null, baslik: "TBLCEKHAREKETLERI" },
  19: { ad: "Verilen Çek Bordrosu", yon: null, baslik: "TBLCEKHAREKETLERI" },
  20: { ad: "Alış Faturası", yon: "ALACAK", baslik: "TBLALFATBASLIK" },
  21: { ad: "Satış Faturası", yon: "BORC", baslik: "TBLSATFATBASLIK" },
  22: { ad: "Alış İade / Alış İrsaliyesi", yon: "ALACAK", baslik: "TBLALFATBASLIK" },
  23: { ad: "Satış İade", yon: "BORC", baslik: null },
  27: { ad: "Satış İrsaliyesi", yon: "BORC", baslik: "TBLSATIRSBASLIK" },
  32: { ad: "Stok Giriş Fişi", yon: "ALACAK", baslik: "TBLSTKGIRBASLIK" },
  33: { ad: "Stok Çıkış Fişi / Zayi", yon: "BORC", baslik: "TBLSTKCIKBASLIK" },
  34: { ad: "Stok Giriş İade Fişi", yon: "ALACAK", baslik: "TBLSTKGIRBASLIK" },
  83: { ad: "Havale (Banka Tahsilat)", yon: "ALACAK", baslik: null },
  84: { ad: "Banka Ödeme / Tediye", yon: "BORC", baslik: null },
  103: { ad: "Cari Devir (açılış)", yon: null, baslik: null },
  104: { ad: "Cari Devir (açılış)", yon: null, baslik: null },
};

function izahatAdi(kod) {
  const n = parseInt(String(kod ?? "").trim(), 10);
  if (!Number.isFinite(n)) return String(kod ?? "").trim() || "(belirsiz)";
  return IZAHAT[n]?.ad ?? `Bilinmeyen belge (${n})`;
}

module.exports = { IZAHAT, izahatAdi };
