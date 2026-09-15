const crypto = require("crypto");

/**
 * İsteğe bağlı 4-6 haneli giriş PIN'i. KULLANICILAR.PAROLAHASH içinde
 * "scrypt$tuz$özet" biçiminde saklanır; düz PIN hiçbir yerde tutulmaz.
 * Kısa PIN'in asıl koruması hash değil, oturum.js'teki deneme kilididir.
 */
const PIN_DESENI = /^\d{4,6}$/;
const OZET_BAYT = 32;

const pinGecerliMi = (pin) => typeof pin === "string" && PIN_DESENI.test(pin);

function pinHashle(pin) {
  if (!pinGecerliMi(pin)) throw new Error("PIN 4-6 haneli rakamdan oluşmalı.");
  const tuz = crypto.randomBytes(16);
  const ozet = crypto.scryptSync(pin, tuz, OZET_BAYT);
  return `scrypt$${tuz.toString("hex")}$${ozet.toString("hex")}`;
}

function pinDogrula(pin, kayit) {
  if (!pinGecerliMi(pin)) return false;
  const [algoritma, tuzHex, ozetHex] = String(kayit || "").split("$");
  if (algoritma !== "scrypt" || !tuzHex || !ozetHex) return false;
  const beklenen = Buffer.from(ozetHex, "hex");
  if (beklenen.length !== OZET_BAYT) return false;
  const hesaplanan = crypto.scryptSync(pin, Buffer.from(tuzHex, "hex"), OZET_BAYT);
  return crypto.timingSafeEqual(beklenen, hesaplanan);
}

const pinVarMi = (kayit) => String(kayit || "").startsWith("scrypt$");

module.exports = { PIN_DESENI, pinGecerliMi, pinHashle, pinDogrula, pinVarMi };
