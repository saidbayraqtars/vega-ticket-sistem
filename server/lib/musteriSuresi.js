const { ayEkle, fmt, isoFmt, hesaplaSozlesme } = require("./sozlesme");

function gunFarki(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  const ilk = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const son = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((son - ilk) / ms);
}

function takvimTarihi(value) {
  const m = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

/** Uygulamada tanımlanan 1-12 aylık süre varsa Vega sözleşme kuralının önüne geçer. */
function hesaplaMusteriSuresi(cari, sureKaydi, bugun = new Date()) {
  if (!sureKaydi) return { ...hesaplaSozlesme(cari, bugun), kaynak: "vega" };

  const baslangic = takvimTarihi(sureKaydi.BASLANGICTARIHI);
  const sureAy = Number(sureKaydi.SUREAY);
  if (Number.isNaN(baslangic.getTime()) || !Number.isInteger(sureAy) || sureAy < 1 || sureAy > 12) {
    return { ...hesaplaSozlesme(cari, bugun), kaynak: "vega" };
  }

  const bitis = ayEkle(baslangic, sureAy);
  const kalanGun = gunFarki(bugun, bitis);
  const rozet = kalanGun < 0 ? "doldu" : kalanGun <= 30 ? "bitiyor" : "aktif";

  return {
    sozlesmeli: true,
    tur: "YENİ MÜŞTERİ",
    turHam: "YENİ MÜŞTERİ",
    etiket: `Yeni müşteri (${sureAy} ay)`,
    rozet,
    baslangic: fmt(baslangic),
    baslangicISO: isoFmt(baslangic),
    bitis: fmt(bitis),
    bitisISO: isoFmt(bitis),
    sureAy,
    kalanGun,
    uyari: null,
    kaynak: "uygulama",
  };
}

module.exports = { hesaplaMusteriSuresi, gunFarki, takvimTarihi };
