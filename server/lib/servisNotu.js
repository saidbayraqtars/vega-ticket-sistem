/**
 * Servis kaydının şirket içi not kutusu. Müşteriye sunulan fiyat teklifi ve
 * cihaza yapılan işlemler burada yazılır; bu metinler hiçbir zaman WhatsApp
 * kuyruğuna girmez, yalnız uygulamayı kullananlar görür.
 */
const NOT_TURLERI = [
  { kod: "NOT", ad: "İç not" },
  { kod: "TEKLIF", ad: "Fiyat teklifi" },
  { kod: "ISLEM", ad: "Yapılan işlem" },
];
const TUR_KODLARI = new Set(NOT_TURLERI.map((t) => t.kod));
const NOT_EN_FAZLA_KARAKTER = 2000;
/** DECIMAL(18,2) sınırı; kuruşlu tutar bu değerin altında kalmalı. */
const TUTAR_SINIRI = 9_999_999_999_999.99;

const NOT_SUTUNLARI = `ID, SERVISID, TUR, METIN, TUTAR, YAZAN, TARIH,
  DUZENLEYEN, GUNCELLEMETARIHI`;

/**
 * Tutar kutusuna "1.250,00", "1250.5" ya da "1250 TL" yazılabilir; hepsi aynı
 * sayıya çözülür. Boş bırakılmak serbesttir (teklif tutarı sonradan belli olur).
 */
function tutarCevir(ham) {
  if (ham === null || ham === undefined || ham === "") return { tutar: null };
  if (typeof ham === "number") {
    if (!Number.isFinite(ham)) return { hata: "Tutar sayı olmalı." };
    return tutarSinirla(ham);
  }
  const metin = String(ham).replace(/[^\d.,-]/g, "").trim();
  if (!metin) return { tutar: null };
  const sayi = Number(duzMetin(metin));
  if (!Number.isFinite(sayi)) return { hata: "Tutar sayı olmalı." };
  return tutarSinirla(sayi);
}

/**
 * Türkçe yazımda nokta binlik ayracıdır: "1.250,00" → 1250.00. Virgül yoksa
 * nokta ancak arkasından tam üç rakam geliyorsa binlik sayılır ("2.500" → 2500);
 * "1250.5" kuruş olarak okunur.
 */
function duzMetin(metin) {
  if (metin.includes(",")) return metin.replace(/\./g, "").replace(",", ".");
  const parcalar = metin.split(".");
  if (parcalar.length > 1 && parcalar.slice(1).every((p) => /^\d{3}$/.test(p))) return parcalar.join("");
  return metin;
}

function tutarSinirla(sayi) {
  if (sayi < 0) return { hata: "Tutar eksi olamaz." };
  if (sayi > TUTAR_SINIRI) return { hata: "Tutar çok büyük." };
  return { tutar: Math.round(sayi * 100) / 100 };
}

/** Gövdeden gelen not satırını doğrular. */
function notNormalize(ham) {
  const tur = String(ham?.TUR ?? ham?.tur ?? "NOT").toUpperCase();
  if (!TUR_KODLARI.has(tur)) return { hata: "Not türü NOT, TEKLIF veya ISLEM olmalı." };
  const metin = String(ham?.METIN ?? ham?.metin ?? "").trim().slice(0, NOT_EN_FAZLA_KARAKTER);
  if (!metin) return { hata: "Not metni boş olamaz." };
  const { tutar, hata } = tutarCevir(ham?.TUTAR ?? ham?.tutar);
  if (hata) return { hata };
  return { tur, metin, tutar };
}

module.exports = {
  NOT_TURLERI,
  TUR_KODLARI,
  NOT_EN_FAZLA_KARAKTER,
  NOT_SUTUNLARI,
  tutarCevir,
  notNormalize,
};
