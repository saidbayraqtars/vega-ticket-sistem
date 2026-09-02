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

/** Vega kartında GSM önceliklidir; yoksa TELEFON1 içindeki cep numarası kullanılır. */
function cariTelefonu(kart) {
  for (const ham of [kart?.GSM, kart?.TELEFON1]) {
    const telefon = normalizeTelefon(ham);
    if (telefon) return telefon;
  }
  return "";
}

module.exports = { normalizeTelefon, cariTelefonu };
