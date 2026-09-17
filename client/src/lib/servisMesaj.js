/** Sunucudaki lib/servisMesaj.js türleriyle aynı sıra ve adlar. */
export const SERVIS_MESAJ_TURLERI = [
  { kod: "KABUL", ad: "Cihaz kabul edildi" },
  { kod: "HAZIR", ad: "Teslime hazır" },
  { kod: "ARIZA", ad: "Yetkili servise gönderildi" },
  { kod: "KARGO", ad: "Kargoya verildi" },
  { kod: "TESLIM", ad: "Teslim edildi" },
  { kod: "GENEL", ad: "Genel bilgilendirme" },
];

export const turAdi = (kod) => SERVIS_MESAJ_TURLERI.find((t) => t.kod === kod)?.ad || kod || "Mesaj";

/** Kaydın durumuna göre gönderim penceresinde önce seçilen mesaj türü. */
export const DURUM_MESAJ_TURU = {
  KABUL: "KABUL", ISLEMDE: "GENEL", HAZIR: "HAZIR", ARIZADA: "ARIZA", KARGODA: "KARGO", TESLIM: "TESLIM", IPTAL: "GENEL",
};

/** Şablon ekranındaki önizleme için kurgusal örnek değerler. */
export const ORNEK_SERVIS_DEGERLERI = {
  firma: "Örnek Bilişim Ltd. Şti.", ad: "Örnek Bilişim Ltd. Şti.", unvan: "Örnek Bilişim Ltd. Şti.",
  kod: "120.01.001", carikodu: "120.01.001", servisno: "SRV-000123", cihaz: "HP LaserJet M404dn",
  serino: "VNB3K12345", yetkili: "Ahmet Yılmaz", kargo: "Yurtiçi Kargo", takipno: "123456789012",
  kabultarihi: "15.09.2026", tarih: new Date().toLocaleDateString("tr-TR"), kullanici: "Servis",
};

export const sablonOnizle = (sablon, degerler = ORNEK_SERVIS_DEGERLERI) =>
  String(sablon || "").replace(/\{([^{}]+)\}/g, (tum, ad) => degerler[String(ad).toLocaleLowerCase("tr-TR")] ?? tum);

// 905321234567 → 0532 123 45 67
export const telefonGoster = (t) =>
  (/^90\d{10}$/.test(t) ? `0${t.slice(2, 5)} ${t.slice(5, 8)} ${t.slice(8, 10)} ${t.slice(10)}` : t);

/** Elle yazılan numarayı sunucunun kabul ettiği 905xxxxxxxxx biçimine indirger; cep değilse boş. */
export function cepNormalize(deger) {
  let rakam = String(deger ?? "").replace(/\D/g, "");
  if (rakam.startsWith("00")) rakam = rakam.slice(2);
  if (/^05\d{9}$/.test(rakam)) rakam = `9${rakam}`;
  else if (/^5\d{9}$/.test(rakam)) rakam = `90${rakam}`;
  return /^905\d{9}$/.test(rakam) ? rakam : "";
}
