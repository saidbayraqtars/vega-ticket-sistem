const crypto = require("crypto");
const db = require("./db");

/**
 * PIN girişi oturumları ve yanlış deneme kilidi.
 *
 * Her bilgisayarın arayüzü kendi yerel sunucusuyla konuşur; oturum da o yerel
 * sunucunun belleğinde durur. Uygulama kapanınca oturum düşer ve PIN'li
 * kullanıcı bir sonraki açılışta yeniden PIN girer — istenen davranış bu.
 */
const OTURUM_MS = 12 * 60 * 60 * 1000;
const ENFAZLA_HATA = 5;
const KILIT_MS = 60 * 1000;
const PIN_ONBELLEK_MS = 15 * 1000;

const oturumlar = new Map(); // belirteç -> { kullanici, sonKullanim }
const hatalar = new Map(); // kullanıcı anahtarı -> { adet, kilitBitis }
let pinOnbellek = { ts: 0, kullanicilar: new Set() };

const anahtar = (kullanici) => String(kullanici || "").trim().toLocaleLowerCase("tr-TR");

function oturumAc(kullanici) {
  const belirtec = crypto.randomBytes(24).toString("hex");
  oturumlar.set(belirtec, { kullanici: String(kullanici).trim(), sonKullanim: Date.now() });
  return belirtec;
}

function oturumCoz(belirtec) {
  const kayit = oturumlar.get(String(belirtec || ""));
  if (!kayit) return null;
  if (Date.now() - kayit.sonKullanim > OTURUM_MS) {
    oturumlar.delete(belirtec);
    return null;
  }
  kayit.sonKullanim = Date.now();
  return kayit.kullanici;
}

const oturumKapat = (belirtec) => oturumlar.delete(String(belirtec || ""));

/** Kilitliyse kalan milisaniye, değilse 0. */
function kilitKalan(kullanici, simdi = Date.now()) {
  const kayit = hatalar.get(anahtar(kullanici));
  return kayit?.kilitBitis > simdi ? kayit.kilitBitis - simdi : 0;
}

/** Yanlış PIN'i sayar; sınır aşılınca kilitler. Kalan deneme hakkını döndürür. */
function hataKaydet(kullanici, simdi = Date.now()) {
  const k = anahtar(kullanici);
  const kayit = hatalar.get(k) || { adet: 0, kilitBitis: 0 };
  if (kayit.kilitBitis && kayit.kilitBitis <= simdi) kayit.adet = 0;
  kayit.adet += 1;
  kayit.kilitBitis = kayit.adet >= ENFAZLA_HATA ? simdi + KILIT_MS : 0;
  hatalar.set(k, kayit);
  return Math.max(ENFAZLA_HATA - kayit.adet, 0);
}

const hataSifirla = (kullanici) => hatalar.delete(anahtar(kullanici));

/** PIN tanımlı kullanıcılar. Her istekte DB'ye gitmemek için kısa süre tutulur. */
async function pinliKullanicilar({ zorla = false } = {}) {
  if (!zorla && Date.now() - pinOnbellek.ts < PIN_ONBELLEK_MS) return pinOnbellek.kullanicilar;
  const r = await db.ticket().request().query(`
    SELECT KULLANICIADI FROM dbo.KULLANICILAR
    WHERE AKTIF = 1 AND PAROLAHASH LIKE 'scrypt$%'
  `);
  pinOnbellek = { ts: Date.now(), kullanicilar: new Set(r.recordset.map((x) => anahtar(x.KULLANICIADI))) };
  return pinOnbellek.kullanicilar;
}

const pinOnbellekTemizle = () => { pinOnbellek = { ts: 0, kullanicilar: new Set() }; };

module.exports = {
  OTURUM_MS, ENFAZLA_HATA, KILIT_MS,
  anahtar, oturumAc, oturumCoz, oturumKapat,
  kilitKalan, hataKaydet, hataSifirla,
  pinliKullanicilar, pinOnbellekTemizle,
};
