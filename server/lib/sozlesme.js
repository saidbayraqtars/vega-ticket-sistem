/**
 * Sözleşme/süre kuralları.
 *
 * Vega'da (doğrulandı, F0103TBLCARI):
 *   KOD1 = müşteri türü. Vega ekranındaki başlığı "Tür".
 *          Geçerli seçenekler F0103TBLCARIKODTAN CATEGORY=1'de tanımlı:
 *          '120', 'YENİ MÜŞTERİ', 'ANLAŞMALI'.
 *   FAKS = sözleşme başlangıç tarihi, 'gg.aa.yyyy'. Kolon nvarchar(20) ve
 *          normalde gerçek faks numarası tutuyor — bu yüzden tarih olmayan
 *          değerler kesinlikle elenmeli (firma 0103'te 204 dolu FAKS'ın 202'si
 *          gerçek numara).
 *
 * Kural: FAKS'ta geçerli tarih yoksa sözleşme yok.
 *        ANLAŞMALI  → başlangıç + 12 ay
 *        YENİ MÜŞTERİ (veya tür boş) → başlangıç + 6 ay
 */

const AY_ANLASMALI = 12;
const AY_YENI = 6;
const BITIYOR_ESIGI_GUN = 30;

// TR-duyarlı büyük harf: i→İ, ı→I. Normal toUpperCase() bunları bozar.
function trUpper(s) {
  return String(s ?? "")
    .replace(/i/g, "İ")
    .replace(/ı/g, "I")
    .toUpperCase();
}

const TUR_ANLASMALI = "ANLAŞMALI";
const TUR_YENI = "YENİ MÜŞTERİ";

/** KOD1 ham değerini bilinen türe indirger. Tanınmayan değer → null. */
function normalizeTur(kod1) {
  const v = trUpper(kod1).trim();
  if (!v) return null;
  if (v === TUR_ANLASMALI || v === "ANLASMALI" || v === "SÖZLEŞMELİ" || v === "SOZLESMELI") {
    return TUR_ANLASMALI;
  }
  if (v === TUR_YENI || v === "YENI MÜŞTERİ" || v === "YENİ MUSTERI" || v === "YENI MUSTERI") {
    return TUR_YENI;
  }
  return null; // '120' gibi muhasebe kodları ve serbest metinler tür değildir
}

/**
 * FAKS alanını sözleşme tarihine çevirir. Telefon/faks numarasını tarih
 * sanmamak için ayraç ve alan aralıkları katı doğrulanır.
 * Kabul: yalnızca sıfır dolgulu gg.aa.yyyy.
 * @returns {Date|null}
 */
function parseSozlesmeTarihi(faks) {
  const raw = String(faks ?? "").trim();
  if (!raw) return null;
  // Boşluk içeren değerler faks numarasıdır ("0362 266 93 97")
  if (/\s/.test(raw)) return null;

  const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const g = +m[1];
  const a = +m[2];
  const y = +m[3];

  if (y < 1990 || y > 2100) return null;
  if (a < 1 || a > 12) return null;
  if (g < 1 || g > 31) return null;

  const d = new Date(y, a - 1, g);
  // 31.02.2026 gibi taşan tarihleri ele
  if (d.getFullYear() !== y || d.getMonth() !== a - 1 || d.getDate() !== g) return null;
  return d;
}

/** Ay ekler; ayın son gününü taşırmaz (31.01 + 1 ay = 28/29.02). */
function ayEkle(date, ay) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const gun = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + ay);
  const sonGun = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(gun, sonGun));
  return d;
}

function gunFarki(a, b) {
  const MS = 24 * 60 * 60 * 1000;
  const ga = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const gb = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((gb - ga) / MS);
}

const iki = (n) => String(n).padStart(2, "0");

function fmt(d) {
  if (!d) return null;
  return `${iki(d.getDate())}.${iki(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// toISOString() yerel geceyarısını UTC'ye çevirip günü kaydırıyor (TR = UTC+3),
// bu yüzden ISO dizgi yerel parçalardan kuruluyor.
function isoFmt(d) {
  if (!d) return null;
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
}

/**
 * Bir cari satırından sözleşme durumunu hesaplar.
 * @param {{KOD1?: string, FAKS?: string, KAYITTARIHI?: Date|string}} cari
 * @param {Date} [bugun]
 */
function hesaplaSozlesme(cari, bugun = new Date()) {
  const turHam = String(cari?.KOD1 ?? "").trim();
  const tur = normalizeTur(turHam);
  const baslangic = parseSozlesmeTarihi(cari?.FAKS);

  if (!baslangic) {
    return {
      sozlesmeli: false,
      tur,
      turHam,
      etiket: tur === TUR_ANLASMALI ? "Anlaşmalı (tarihsiz)" : "Sözleşmesiz",
      rozet: "yok",
      baslangic: null,
      bitis: null,
      sureAy: null,
      kalanGun: null,
      uyari: tur === TUR_ANLASMALI ? "Tür ANLAŞMALI ama FAKS alanında sözleşme tarihi yok." : null,
    };
  }

  const sureAy = tur === TUR_ANLASMALI ? AY_ANLASMALI : AY_YENI;
  const bitis = ayEkle(baslangic, sureAy);
  const kalanGun = gunFarki(bugun, bitis);

  let rozet;
  if (kalanGun < 0) rozet = "doldu";
  else if (kalanGun <= BITIYOR_ESIGI_GUN) rozet = "bitiyor";
  else rozet = "aktif";

  const etiket = tur === TUR_ANLASMALI ? "Anlaşmalı (1 yıl)" : "Yeni müşteri (6 ay)";

  return {
    sozlesmeli: true,
    tur: tur ?? TUR_YENI,
    turHam,
    etiket,
    rozet,
    baslangic: fmt(baslangic),
    baslangicISO: isoFmt(baslangic),
    bitis: fmt(bitis),
    bitisISO: isoFmt(bitis),
    sureAy,
    kalanGun,
    uyari: tur === null && turHam ? `Tür alanı ("${turHam}") tanınmadı, 6 ay varsayıldı.` : null,
  };
}

module.exports = {
  AY_ANLASMALI,
  AY_YENI,
  BITIYOR_ESIGI_GUN,
  TUR_ANLASMALI,
  TUR_YENI,
  trUpper,
  normalizeTur,
  parseSozlesmeTarihi,
  ayEkle,
  hesaplaSozlesme,
  fmt,
  isoFmt,
};
