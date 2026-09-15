/**
 * Code 128 (B kod kümesi) barkod üretimi — bağımlılıksız.
 * Servis no, takip no gibi yazdırılabilir ASCII metinler için yeterli.
 * Çıktı modül genişlikleri; SVG'ye çevirmek için barkodSvg kullanılır.
 */

// Değer → çubuk/boşluk genişlikleri (siyahla başlar). 103-105 başlangıç, 106 bitiş.
const DESENLER = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const BASLA_B = 104;
const BITIR = 106;
const SESSIZ_BOLGE = 10;

/** Türkçe karakterleri barkodun okuyabileceği ASCII karşılığına indirger. */
export function barkodMetni(metin) {
  const harita = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U" };
  return String(metin ?? "").replace(/[^\x20-\x7e]/g, (ch) => harita[ch] ?? "");
}

/** Metin → sembol değerleri (başlangıç, veri, sağlama, bitiş). */
export function code128Degerler(metin) {
  const temiz = barkodMetni(metin);
  if (!temiz) throw new Error("Barkod metni boş.");
  const veri = [...temiz].map((ch) => ch.charCodeAt(0) - 32);
  const saglama = veri.reduce((top, deger, i) => top + deger * (i + 1), BASLA_B) % 103;
  return [BASLA_B, ...veri, saglama, BITIR];
}

/** Sessiz bölgeler dahil modül dizisi: [{siyah, genislik}]. */
export function code128Moduller(metin) {
  const parcalar = [];
  for (const deger of code128Degerler(metin)) {
    [...DESENLER[deger]].forEach((g, i) => parcalar.push({ siyah: i % 2 === 0, genislik: Number(g) }));
  }
  return parcalar;
}

/**
 * SVG dizgisi, ölçüler mm. `modul` tek modülün genişliği; `enFazlaGenislik`
 * verilirse uzun metin (takip no) sayfadan taşmasın diye modül küçültülür.
 * Okuyucular için 0.25 mm altına inilmemeli.
 */
export function barkodSvg(metin, { modul = 0.4, enFazlaGenislik = null, yukseklik = 18, yaziGoster = true, yaziBoyu = 3.2 } = {}) {
  const moduller = code128Moduller(metin);
  const toplam = moduller.reduce((t, m) => t + m.genislik, 0) + SESSIZ_BOLGE * 2;
  const m = enFazlaGenislik ? Math.min(modul, enFazlaGenislik / toplam) : modul;
  const genislikMm = toplam * m;
  const yaziAlani = yaziGoster ? yaziBoyu + 1.2 : 0;
  const yuvarla = (n) => Math.round(n * 1000) / 1000;
  let x = SESSIZ_BOLGE;
  const cubuklar = [];
  for (const parca of moduller) {
    if (parca.siyah) cubuklar.push(`<rect x="${yuvarla(x * m)}" y="0" width="${yuvarla(parca.genislik * m)}" height="${yukseklik}"/>`);
    x += parca.genislik;
  }
  const kacis = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const yazi = yaziGoster
    ? `<text x="${yuvarla(genislikMm / 2)}" y="${yukseklik + yaziBoyu + 0.6}" font-family="Consolas, 'Courier New', monospace" font-size="${yaziBoyu}" text-anchor="middle">${kacis(barkodMetni(metin))}</text>`
    : "";
  const w = yuvarla(genislikMm);
  const h = yuvarla(yukseklik + yaziAlani);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><g fill="#000" shape-rendering="crispEdges">${cubuklar.join("")}</g>${yazi}</svg>`;
}

export const _test = { DESENLER, SESSIZ_BOLGE };
