/**
 * Cari arama — "Google mantığı": önce tam/ön ek/içerik eşleşmesi, bulunamazsa
 * bulanık eşleşme + "şunu mu demek istediniz?" önerisi.
 *
 * Arama bellekteki indeks üzerinde yapılır (bir firmada ~40 bin cari ≈ 6 MB),
 * çünkü SQL tarafında Türkçe karakter normalizasyonu ve yazım düzeltmesi
 * güvenilir şekilde yapılamıyor.
 */
const { cariTelefonMetni } = require("./telefon");

const TR_MAP = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", I: "i", İ: "i", i: "i",
  ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u", â: "a", Â: "a", î: "i", û: "u",
};

/** Türkçe karakterleri sadeleştirir, küçük harfe indirir, noktalamayı boşluğa çevirir. */
function normalize(s) {
  let out = "";
  for (const ch of String(s ?? "")) out += TR_MAP[ch] ?? ch;
  return out
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const tokenize = (s) => normalize(s).split(" ").filter(Boolean);

/** Sınırlı Levenshtein — mesafe max'ı aşarsa erken çıkar. */
function levenshtein(a, b, max = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let satirMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const bedel = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + bedel);
      if (cur[j] < satirMin) satirMin = cur[j];
    }
    if (satirMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

function trigramlar(s) {
  const p = `  ${s} `;
  const set = new Set();
  for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3));
  return set;
}

/** Dice katsayısı (0..1). */
function trigramBenzerlik(a, b) {
  if (!a || !b) return 0;
  const A = trigramlar(a);
  const B = trigramlar(b);
  let ortak = 0;
  for (const t of A) if (B.has(t)) ortak++;
  return (2 * ortak) / (A.size + B.size);
}

/**
 * @param {Array<{IND:number,FIRMAKODU:string,AD:string}>} rows
 */
function indeksOlustur(rows) {
  const kayitlar = rows.map((r) => {
    const ad = normalize(r.AD);
    const kod = normalize(r.FIRMAKODU);
    const ek = normalize(`${r.YETKILI || ""} ${cariTelefonMetni(r)}`);
    return { r, ad, kod, metin: `${kod} ${ad} ${ek}`.trim(), tokenlar: ad.split(" ").filter(Boolean) };
  });

  // Yazım düzeltmesi için kelime dağarcığı (frekanslı)
  const sozluk = new Map();
  for (const k of kayitlar) {
    for (const t of k.tokenlar) {
      if (t.length < 3) continue;
      sozluk.set(t, (sozluk.get(t) ?? 0) + 1);
    }
  }
  return { kayitlar, sozluk };
}

/** Tek kelimeyi sözlükteki en yakın kelimeye düzeltir. */
function kelimeDuzelt(sozluk, kelime) {
  if (kelime.length < 3 || sozluk.has(kelime)) return null;
  const max = kelime.length <= 4 ? 1 : 2;
  let enIyi = null;
  let enIyiMesafe = max + 1;
  let enIyiFrekans = 0;
  for (const [aday, frekans] of sozluk) {
    if (Math.abs(aday.length - kelime.length) > max) continue;
    const d = levenshtein(kelime, aday, max);
    if (d > max) continue;
    if (d < enIyiMesafe || (d === enIyiMesafe && frekans > enIyiFrekans)) {
      enIyi = aday;
      enIyiMesafe = d;
      enIyiFrekans = frekans;
    }
  }
  return enIyi;
}

const PUAN = { TAM_KOD: 1000, TAM_AD: 950, KOD_ONEK: 880, AD_ONEK: 820, ICERIK: 640, TUM_TOKEN: 480 };

function puanla(kayit, q, qTokenlar) {
  if (kayit.kod === q) return PUAN.TAM_KOD;
  if (kayit.ad === q) return PUAN.TAM_AD;
  if (kayit.kod.startsWith(q)) return PUAN.KOD_ONEK - kayit.kod.length;
  if (kayit.ad.startsWith(q)) return PUAN.AD_ONEK - Math.min(kayit.ad.length, 200);
  if (kayit.metin.includes(q)) return PUAN.ICERIK - Math.min(kayit.metin.length, 200);
  if (qTokenlar.length > 1 && qTokenlar.every((t) => kayit.metin.includes(t))) {
    return PUAN.TUM_TOKEN - Math.min(kayit.metin.length, 200);
  }
  return 0;
}

/**
 * @returns {{sonuclar: Array, oneri: {sorgu:string, adet:number}|null, bulanik: boolean}}
 */
function ara(indeks, sorgu, { limit = 50 } = {}) {
  const q = normalize(sorgu);
  if (!q) return { sonuclar: [], oneri: null, bulanik: false };
  const qTokenlar = q.split(" ").filter(Boolean);

  const vurusler = [];
  for (const kayit of indeks.kayitlar) {
    const puan = puanla(kayit, q, qTokenlar);
    if (puan > 0) vurusler.push({ puan, kayit });
  }

  if (vurusler.length > 0) {
    vurusler.sort((a, b) => b.puan - a.puan || a.kayit.ad.localeCompare(b.kayit.ad, "tr"));
    const sonuclar = vurusler.slice(0, limit).map((v) => ({ ...v.kayit.r, _puan: v.puan }));

    // Sonuç az ve zayıfsa yine de düzeltme öner ("Google: ... için sonuçlar")
    let oneri = null;
    if (vurusler.length <= 2 && vurusler[0].puan < PUAN.ICERIK) {
      oneri = duzeltmeOner(indeks, qTokenlar, q);
    }
    return { sonuclar, oneri, bulanik: false };
  }

  // Hiç eşleşme yok → bulanık arama + öneri
  const bulanikVurus = [];
  for (const kayit of indeks.kayitlar) {
    const sim = Math.max(trigramBenzerlik(q, kayit.ad), trigramBenzerlik(q, kayit.kod));
    if (sim >= 0.34) bulanikVurus.push({ puan: Math.round(sim * 400), kayit });
  }
  bulanikVurus.sort((a, b) => b.puan - a.puan);

  return {
    sonuclar: bulanikVurus.slice(0, limit).map((v) => ({ ...v.kayit.r, _puan: v.puan })),
    oneri: duzeltmeOner(indeks, qTokenlar, q),
    bulanik: true,
  };
}

function duzeltmeOner(indeks, qTokenlar, q) {
  const duzeltilmis = qTokenlar.map((t) => kelimeDuzelt(indeks.sozluk, t) ?? t);
  const yeniSorgu = duzeltilmis.join(" ");
  if (yeniSorgu === q) return null;
  const adet = indeks.kayitlar.reduce(
    (n, k) => n + (duzeltilmis.every((t) => k.metin.includes(t)) ? 1 : 0),
    0
  );
  if (adet === 0) return null;
  return { sorgu: yeniSorgu, adet };
}

module.exports = { normalize, tokenize, levenshtein, trigramBenzerlik, indeksOlustur, ara };
