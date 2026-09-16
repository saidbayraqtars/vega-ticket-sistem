/** Türkiye cep numarasını WhatsApp JID biçimine (905xxxxxxxxx) indirger. */
function normalizeTelefon(value) {
  const metin = String(value ?? "").trim();
  if (!metin) return "";

  // Bir alanda birden fazla numara varsa ilk tam cep numarasını seç.
  const adaylar = metin.match(/(?:\+?90|0090|0)?5\d(?:[\s()./-]*\d){8}/g) || [metin];
  for (const aday of adaylar) {
    let rakam = aday.replace(/\D/g, "");
    if (rakam.startsWith("00")) rakam = rakam.slice(2);
    if (/^05\d{9}$/.test(rakam)) rakam = `9${rakam}`;
    else if (/^5\d{9}$/.test(rakam)) rakam = `90${rakam}`;
    if (/^905\d{9}$/.test(rakam)) return rakam;
  }
  return "";
}

/**
 * Vega sürümlerinde telefon alanları değişebiliyor. FAKS sözleşme tarihi için
 * de kullanıldığı, KEFIL* ise cariye ait olmadığı için telefon adayı değildir.
 */
function telefonKolonuMu(kolon) {
  const ad = String(kolon || "").toUpperCase();
  if (/KEFIL|FAKS|FAX|MODEM|GONDER|IZNIVAR/.test(ad)) return false;
  return /GSM|CEP|MOBIL/.test(ad) || /TELEFON/.test(ad) || /^TEL\d/.test(ad);
}

/** Önce carinin kendi cep/telefon alanları, sonra Y* (yetkili) alanları. */
function telefonKolonlariniSirala(kolonlar) {
  const puan = (kolon) => {
    const ad = String(kolon).toUpperCase();
    return (/^Y/.test(ad) ? 10 : 0) + (/GSM|CEP|MOBIL/.test(ad) ? 0 : 1);
  };
  return [...new Set((kolonlar || []).filter(telefonKolonuMu))]
    .sort((a, b) => puan(a) - puan(b) || String(a).localeCompare(String(b), "tr"));
}

/** Arama için karttaki bütün telefon alanlarını birleştirir. */
function cariTelefonMetni(kart) {
  const degerler = telefonKolonlariniSirala(Object.keys(kart || {}))
    .map((kolon) => String(kart?.[kolon] ?? "").trim())
    .filter(Boolean);
  // Kullanıcı boşluklu ya da yalnız rakam yazarak arayabilsin.
  return degerler.flatMap((deger) => [deger, deger.replace(/\D/g, "")]).join(" ");
}

/** Karttaki ilk WhatsApp'a uygun numaranın Vega'da yazılı ham değerini verir. */
function cariTelefonDegeri(kart) {
  for (const kolon of telefonKolonlariniSirala(Object.keys(kart || {}))) {
    const ham = String(kart?.[kolon] ?? "").trim();
    if (normalizeTelefon(ham)) return ham;
  }
  return "";
}

/** Vega kartındaki tüm gerçek telefon alanlarından WhatsApp numarasını bulur. */
function cariTelefonu(kart) {
  return normalizeTelefon(cariTelefonDegeri(kart));
}

/** Bir alandaki bütün cep numaraları ("0532... / 0544...") WhatsApp biçiminde. */
function telefonlariAyikla(value) {
  const adaylar = String(value ?? "").match(/(?:\+?90|0090|0)?5\d(?:[\s()./-]*\d){8}/g) || [];
  return adaylar.map(normalizeTelefon).filter(Boolean);
}

/** WhatsApp bildiriminin gideceği farklı cep numaraları, alan önceliğiyle en çok üç tane. */
const BILDIRIM_TELEFON_SINIRI = 3;
function cariTelefonlari(kart, enFazla = BILDIRIM_TELEFON_SINIRI) {
  const telefonlar = new Set();
  for (const kolon of telefonKolonlariniSirala(Object.keys(kart || {}))) {
    for (const telefon of telefonlariAyikla(kart?.[kolon])) telefonlar.add(telefon);
  }
  return [...telefonlar].slice(0, enFazla);
}

module.exports = {
  BILDIRIM_TELEFON_SINIRI,
  normalizeTelefon,
  telefonlariAyikla,
  cariTelefonlari,
  telefonKolonuMu,
  telefonKolonlariniSirala,
  cariTelefonMetni,
  cariTelefonDegeri,
  cariTelefonu,
};
