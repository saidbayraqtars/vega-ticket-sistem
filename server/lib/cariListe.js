/**
 * Müşteri listesinin sıralama ve filtre kuralları. Saf modül: zenginleştirilmiş
 * kart dizisi alır, yeni dizi döndürür. Liste 40 bin satıra kadar sunucuda
 * sayfalandığı için filtre de burada uygulanır; istemci yalnız sayfayı görür.
 */
const { normalize } = require("./arama");

const trSirala = new Intl.Collator("tr", { sensitivity: "base", numeric: true });

const TURLER = ["ANLAŞMALI", "YENİ MÜŞTERİ", "TANIMSIZ"];
const BORC_DURUMLARI = ["BORCLU", "ALACAKLI", "BORCU_YOK"];
const SURE_DURUMLARI = ["aktif", "bitiyor", "doldu", "yok"];

const turDegeri = (r) => r.sure?.tur || "TANIMSIZ";
const sureDegeri = (r) => r.sure?.rozet || "yok";

/** Sıralama anahtarı → karşılaştırıcı. Bilinmeyen anahtar ada göre sıralar. */
const KARSILASTIRICILAR = {
  kod: (a, b) => trSirala.compare(a.FIRMAKODU, b.FIRMAKODU),
  ad: (a, b) => trSirala.compare(a.AD, b.AD),
  tur: (a, b) => trSirala.compare(turDegeri(a), turDegeri(b)),
  borc: (a, b) => BORC_DURUMLARI.indexOf(a.borcDurumu) - BORC_DURUMLARI.indexOf(b.borcDurumu),
  bakiye: (a, b) => Number(a.BAKIYE) - Number(b.BAKIYE),
  sure: (a, b) => Number(a.sure?.sureAy || 0) - Number(b.sure?.sureAy || 0),
  bitis: (a, b) => {
    const av = String(a.sure?.bitisISO || "9999-12-31");
    const bv = String(b.sure?.bitisISO || "9999-12-31");
    return av < bv ? -1 : av > bv ? 1 : 0;
  },
};

const siralamaAnahtari = (deger) => (Object.hasOwn(KARSILASTIRICILAR, deger) ? deger : "ad");

function sirala(liste, anahtar, yon) {
  const karsilastir = KARSILASTIRICILAR[siralamaAnahtari(anahtar)];
  const carpan = yon === "desc" ? -1 : 1;
  // Eşit anahtarda sıra her istekte aynı kalsın; sayfalar arası satır kaymasın.
  return [...liste].sort((a, b) => karsilastir(a, b) * carpan || trSirala.compare(a.AD, b.AD) || a.IND - b.IND);
}

/** Virgülle ayrılmış çoklu seçim; tanınmayan değerler atılır. */
function secimCevir(deger, izinli) {
  const liste = String(deger ?? "").split(",").map((x) => x.trim()).filter((x) => izinli.includes(x));
  return liste.length ? new Set(liste) : null;
}

/** Sorgu dizgisinden filtre nesnesi. Boş alanlar filtre uygulamaz. */
function filtreCevir(q = {}) {
  return {
    metin: normalize(q.ara || ""),
    kod: normalize(q.kod || ""),
    ad: normalize(q.ad || ""),
    tur: secimCevir(q.tur, TURLER),
    borc: secimCevir(q.borc, BORC_DURUMLARI),
    sure: secimCevir(q.sure, SURE_DURUMLARI),
  };
}

const filtreBosMu = (f) => !f.metin && !f.kod && !f.ad && !f.tur && !f.borc && !f.sure;

function filtrele(liste, f) {
  if (filtreBosMu(f)) return liste;
  return liste.filter((r) => {
    if (f.tur && !f.tur.has(turDegeri(r))) return false;
    if (f.borc && !f.borc.has(r.borcDurumu)) return false;
    if (f.sure && !f.sure.has(sureDegeri(r))) return false;
    if (f.kod && !normalize(r.FIRMAKODU).includes(f.kod)) return false;
    if (f.ad && !normalize(r.AD).includes(f.ad)) return false;
    if (f.metin) {
      const hedef = normalize(`${r.FIRMAKODU} ${r.AD} ${r.YETKILI || ""} ${r.GSM || ""} ${r.TELEFON1 || ""}`);
      if (!f.metin.split(" ").every((parca) => hedef.includes(parca))) return false;
    }
    return true;
  });
}

/** Filtrelenmiş listedeki dağılım — başlıktaki seçimlerde adet göstermek için. */
function ozet(liste) {
  const say = (fn, anahtarlar) => Object.fromEntries(anahtarlar.map((k) => [k, liste.filter((r) => fn(r) === k).length]));
  return {
    tur: say(turDegeri, TURLER),
    borc: say((r) => r.borcDurumu, BORC_DURUMLARI),
    sure: say(sureDegeri, SURE_DURUMLARI),
  };
}

module.exports = {
  TURLER, BORC_DURUMLARI, SURE_DURUMLARI,
  siralamaAnahtari, sirala, filtreCevir, filtrele, filtreBosMu, ozet,
};
