const fs = require("fs");
const path = require("path");

// Gayriresmî istemcide ban riskini artıran şey art arda, aynı aralıkla ve
// yüksek hacimde gönderimdir. Her numaraya gidiş bir gönderim sayılır.
const ARALIK_MIN_MS = 20000;
const ARALIK_MAX_MS = 45000;
const SAATLIK = 30;
const GUNLUK = 150;
const SAAT_MS = 60 * 60 * 1000;
const GUN_MS = 24 * SAAT_MS;

const baseDir = process.env.VEGA_TICKET_BASE_DIR || path.join(__dirname, "..");
const kayitDosyasi = path.join(baseDir, "whatsapp-gonderimler.json");

const rastgeleAralik = () => ARALIK_MIN_MS + Math.floor(Math.random() * (ARALIK_MAX_MS - ARALIK_MIN_MS));

/**
 * Bir sonraki gönderime kadar beklenecek süre. `adet` gönderimlik yer açılana
 * kadar bekletir; bir mesaj en çok üç numaraya gittiği için kuyruktan mesaj
 * alınmadan önce üç gönderimlik yer aranır, yoksa mesaj yarıda kalırdı.
 * @param {number[]} zamanlar son 24 saatteki gönderim zamanları (artan)
 * @returns {{ms:number, neden:null|"aralik"|"saatlik"|"gunluk"}}
 */
function beklemeHesapla(zamanlar, simdi, { adet = 1, sonrakiAralik = ARALIK_MIN_MS } = {}) {
  const pencere = (sure, sinir) => {
    const icindekiler = zamanlar.filter((t) => t > simdi - sure);
    const fazla = icindekiler.length + adet - sinir;
    // En eski `fazla` gönderim pencereden çıkınca yer açılır.
    return fazla > 0 ? icindekiler[fazla - 1] + sure - simdi : 0;
  };
  const gunluk = pencere(GUN_MS, GUNLUK);
  if (gunluk > 0) return { ms: gunluk, neden: "gunluk" };
  const saatlik = pencere(SAAT_MS, SAATLIK);
  if (saatlik > 0) return { ms: saatlik, neden: "saatlik" };
  const son = zamanlar[zamanlar.length - 1];
  const aralik = son ? son + sonrakiAralik - simdi : 0;
  return aralik > 0 ? { ms: aralik, neden: "aralik" } : { ms: 0, neden: null };
}

let zamanlar = null;
let sonrakiAralik = rastgeleAralik();

function zamanlariAl(simdi = Date.now()) {
  if (!zamanlar) {
    try {
      const okunan = JSON.parse(fs.readFileSync(kayitDosyasi, "utf8"));
      zamanlar = Array.isArray(okunan) ? okunan.filter(Number.isFinite).sort((a, b) => a - b) : [];
    } catch {
      zamanlar = [];
    }
  }
  zamanlar = zamanlar.filter((t) => t > simdi - GUN_MS);
  return zamanlar;
}

function bekleme(adet = 1, simdi = Date.now()) {
  return beklemeHesapla(zamanlariAl(simdi), simdi, { adet, sonrakiAralik });
}

/** Gönderim yapıldı; sonraki aralık her seferinde yeniden rastgele seçilir. */
function kaydet(simdi = Date.now()) {
  zamanlariAl(simdi).push(simdi);
  sonrakiAralik = rastgeleAralik();
  try {
    fs.writeFileSync(kayitDosyasi, JSON.stringify(zamanlar));
  } catch { /* bellekteki kayıt bu çalışma için yeterli */ }
}

/** Numaralar arası aralığı bekler; saatlik/günlük sınırı kuyruk alımı denetler. */
async function aralikBekle() {
  const { ms, neden } = bekleme();
  if (neden === "aralik") await new Promise((resolve) => setTimeout(resolve, ms));
}

function sinirNotu({ ms, neden }, simdi = Date.now()) {
  if (neden !== "saatlik" && neden !== "gunluk") return null;
  const saat = new Date(simdi + ms).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const sinir = neden === "gunluk" ? `Günlük ${GUNLUK}` : `Saatlik ${SAATLIK}`;
  return `${sinir} gönderim sınırı doldu; sıradaki gönderim ${saat} sonrası.`;
}

module.exports = {
  ARALIK_MIN_MS,
  ARALIK_MAX_MS,
  SAATLIK,
  GUNLUK,
  beklemeHesapla,
  bekleme,
  kaydet,
  aralikBekle,
  sinirNotu,
};
