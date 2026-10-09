import { barkodSvg } from "./code128";
import { ADRES_ETIKETI_CSS, adresEtiketiSayfasi, sayfaCss, tasarimNormalize } from "./adresEtiketi";

/**
 * A5 adres etiketi ve barkod çıktısı. Termal etiket yazıcısından farklı olarak
 * normal (A4/A5) yazıcıya gider. Masaüstü uygulamasında önizlemeli yazdırma
 * penceresi açılır (components/A5YazdirmaPenceresi) ve kâğıt A5 seçili basılır;
 * tarayıcıda sayfa gizli bir iframe'e yazılıp tarayıcının yazdırma penceresi açılır.
 */

const kacis = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const tarihTR = (d) => (d ? new Date(d).toLocaleDateString("tr-TR") : "");
const cihazAdi = (c) => [c.CINS, [c.MARKA, c.MODEL].filter(Boolean).join(" ")].filter(Boolean).join(": ") || "Cihaz";

// A5 = 148 × 210 mm; 8 mm kenarla kullanılabilir alan 132 × 194 mm. Sayfa kenar
// boşluğunu yazıcı belirlerse de taşmasın diye kartlar kalan genişliğe yayılır.
const KENAR_MM = 8;
const A5_CSS = `
  @page { size: A5 portrait; margin: ${KENAR_MM}mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #000; font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sayfa { width: 100%; display: flex; flex-direction: column; gap: 3mm; break-after: page; }
  .sayfa:last-child { break-after: auto; }
  .kart { display: grid; grid-template-columns: auto 1fr; gap: 4mm; align-items: center;
    border: 0.3mm dashed #000; padding: 2.5mm 3mm; break-inside: avoid; }
  .kart .ad { font-size: 11pt; font-weight: 700; }
  .kart .alt { font-size: 9pt; line-height: 1.3; }
`;

const belgeHtml = (baslik, govde, css) =>
  `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${kacis(baslik)}</title><style>${A5_CSS}${css}</style></head><body>${govde}</body></html>`;

// Ekranda @page kenar boşluğu uygulanmaz; önizlemede gövde dolgusuyla gösterilir.
const onizlemeCss = (kenar) => `html { background: #fff; } body { padding: ${kenar}mm; }`;

/**
 * A4 kâğıdın üst yarısına (210 × 148,5 mm) basmak için. A4 takılı yazıcıya A5
 * gönderilince sürücü sayfayı A4'ün ortasına koyuyor; burada kâğıt A4 seçilir ve
 * A5 yatay ölçüdeki içerik üst yarıya yerleşir. Dikey A5 tasarım (148 × 210 mm)
 * üst yarıya sığsın diye 90° döndürülür. Kenar boşluklu (akan) sayfalarda alt
 * kenar boşluğu sayfanın alt yarısını kapatır; sığmayan kartlar sonraki A4'e geçer.
 */
export const A4_YARI_MM = 148.5;
const a4YariCss = (yon, kenar) => {
  if (kenar > 0) return `@page { size: A4 portrait; margin: ${kenar}mm ${kenar}mm ${297 - A4_YARI_MM + kenar}mm ${kenar}mm; }`;
  return `@page { size: A4 portrait; margin: 0; }
  html, body { width: 210mm; height: ${A4_YARI_MM}mm; overflow: hidden; }
  ${yon === "dikey" ? "body > * { transform-origin: 0 0; transform: translateY(148mm) rotate(-90deg); }" : ""}`;
};
// Önizlemede kâğıdın ortası (katlama/kesme yeri) kesik çizgiyle gösterilir.
const a4YariOnizlemeCss = (kenar) =>
  `html { background: #fff repeating-linear-gradient(to right, #9aa3ad 0 2mm, transparent 2mm 4mm) 0 ${A4_YARI_MM}mm / 100% 0.3mm no-repeat; min-height: 297mm; }
  body { padding: ${kenar}mm; }`;

// Masaüstü uygulamasındaki yazdırma penceresi açılınca buraya bağlanır.
let pencereAc = null;
export function yazdirmaPenceresiBagla(ac) {
  pencereAc = ac;
  return () => { if (pencereAc === ac) pencereAc = null; };
}

/**
 * A5 sayfayı yazdırır. `yon` kâğıdın yönü, `kenar` sayfa kenar boşluğudur (mm).
 * Pencere kapanınca (yazdırıldı ya da vazgeçildi) çözülür.
 */
export function yazdir(baslik, govde, { css = "", yon = "dikey", kenar = KENAR_MM } = {}) {
  const html = belgeHtml(baslik, govde, css);
  if (window.vegaMasaustu?.a5Yazdir && pencereAc) {
    return new Promise((cozumle) => pencereAc({
      baslik, yon, kenar,
      kagitlar: {
        a5: { html, onizleme: belgeHtml(baslik, govde, css + onizlemeCss(kenar)) },
        a4yari: {
          html: belgeHtml(baslik, govde, css + a4YariCss(yon, kenar)),
          onizleme: belgeHtml(baslik, govde, css + a4YariCss(yon, kenar) + a4YariOnizlemeCss(kenar)),
        },
      },
      bitti: cozumle,
    }));
  }
  return tarayicidaYazdir(html);
}

/** HTML'i gizli iframe'de açıp tarayıcının yazdırma penceresini gösterir. */
function tarayicidaYazdir(html) {
  return new Promise((cozumle, reddet) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    // display:none iframe bazı Chromium sürümlerinde boş sayfa basıyor; 0 boyut yeterli.
    Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(iframe);
    const belge = iframe.contentDocument;
    belge.open();
    belge.write(html);
    belge.close();
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        cozumle();
      } catch (err) {
        reddet(err);
      } finally {
        setTimeout(() => iframe.remove(), 1000);
      }
    }, 200);
  });
}

/** Tasarımdaki yerleşimle A5 adres etiketini yazdırır (bkz. lib/adresEtiketi.js). */
export function adresEtiketiYazdir({ kayit, gonderim, gonderen, tasarim }) {
  const duzen = tasarimNormalize(tasarim);
  return yazdir(
    `${kayit.SERVISNO || "Örnek"} adres etiketi`,
    adresEtiketiSayfasi({ kayit, gonderim, gonderen, tasarim: duzen }),
    { css: ADRES_ETIKETI_CSS + sayfaCss(duzen), yon: duzen.yon, kenar: 0 },
  );
}

/** Cihaz başına barkod kartları: kutuya/cihaza yapıştırmak ve okutarak bulmak için. */
export function barkodSayfasiHtml({ kayit }) {
  const cihazlar = kayit.cihazlar || [];
  const kart = (kod, ad, alt) => `
    <div class="kart">
      <div>${barkodSvg(kod, { modul: 0.4, enFazlaGenislik: 80, yukseklik: 16 })}</div>
      <div><div class="ad">${kacis(ad)}</div><div class="alt">${alt}</div></div>
    </div>`;

  const kartlar = [
    kart(kayit.SERVISNO, kayit.CARIADI || "", `${kacis(kayit.SERVISNO)} · ${cihazlar.length} cihaz<br>Kabul: ${tarihTR(kayit.KABULTARIHI)}`),
    ...cihazlar.map((c) => kart(
      `${kayit.SERVISNO}-${c.SIRA}`,
      cihazAdi(c),
      [kacis(kayit.CARIADI || ""), c.SERINO ? `S/N: ${kacis(c.SERINO)}` : "", c.ARIZA ? `Arıza: ${kacis(c.ARIZA)}` : ""].filter(Boolean).join("<br>"),
    )),
  ];
  return `<div class="sayfa" style="gap:3mm">${kartlar.join("")}</div>`;
}
