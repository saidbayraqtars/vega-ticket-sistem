/** Ticket alanları için saf doğrulama ve dönüştürme kuralları. */

/**
 * Türkçe ve noktalı ondalık ücret biçimlerini kabul eder.
 * Geçersiz, negatif veya DECIMAL(18,2) sınırını aşan değerlerde null döner.
 */
function ucretCevir(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && value <= 9999999999999999.99 ? value : null;
  }

  const raw = String(value).trim().replace(/\s/g, "");
  if (!raw || !/^\d[\d.,]*$/.test(raw)) return null;

  const sonNokta = raw.lastIndexOf(".");
  const sonVirgul = raw.lastIndexOf(",");
  let normalized;

  if (sonNokta >= 0 && sonVirgul >= 0) {
    const ondalik = sonNokta > sonVirgul ? "." : ",";
    const binlik = ondalik === "." ? "," : ".";
    const bolumler = raw.split(ondalik);
    if (bolumler.length !== 2 || !/^\d{1,2}$/.test(bolumler[1])) return null;
    const binlikDeseni = binlik === "." ? /^\d{1,3}(\.\d{3})+$/ : /^\d{1,3}(,\d{3})+$/;
    if (!/^\d+$/.test(bolumler[0]) && !binlikDeseni.test(bolumler[0])) return null;
    normalized = raw.split(binlik).join("").replace(ondalik, ".");
  } else if (sonVirgul >= 0) {
    if ((raw.match(/,/g) || []).length !== 1) return null;
    normalized = raw.replace(",", ".");
  } else if (sonNokta >= 0) {
    const noktalar = (raw.match(/\./g) || []).length;
    if (noktalar === 1) {
      const [tam, kesir] = raw.split(".");
      normalized = kesir.length === 3 && tam.length <= 3 ? tam + kesir : raw;
    } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
      normalized = raw.replace(/\./g, "");
    } else {
      return null;
    }
  } else {
    normalized = raw;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 && n <= 9999999999999999.99 ? n : null;
}

/** YYYY-MM-DD tarihini yerel takvim tarihi olarak ayrıştırır. */
function tarihCevir(value) {
  if (value === null || value === undefined || value === "") return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const yil = Number(m[1]);
  const ay = Number(m[2]);
  const gun = Number(m[3]);
  const d = new Date(yil, ay - 1, gun);
  if (d.getFullYear() !== yil || d.getMonth() !== ay - 1 || d.getDate() !== gun) return undefined;
  return d;
}

function rvCevir(value) {
  const raw = String(value ?? "").trim();
  return /^[0-9a-fA-F]{16}$/.test(raw) ? Buffer.from(raw, "hex") : null;
}

module.exports = { ucretCevir, tarihCevir, rvCevir };
