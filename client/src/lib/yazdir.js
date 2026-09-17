import { barkodSvg } from "./code128";
import { ADRES_ETIKETI_CSS, adresEtiketiSayfasi, sayfaCss, tasarimNormalize } from "./adresEtiketi";

/**
 * A5 adres etiketi ve barkod çıktısı. Termal etiket yazıcısından farklı olarak
 * normal (A4/A5) yazıcıya gider: sayfa gizli bir iframe'e yazılıp tarayıcının
 * yazdırma penceresi açılır, yazıcı ve kâğıt orada seçilir.
 */

const kacis = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const tarihTR = (d) => (d ? new Date(d).toLocaleDateString("tr-TR") : "");
const cihazAdi = (c) => [c.CINS, [c.MARKA, c.MODEL].filter(Boolean).join(" ")].filter(Boolean).join(": ") || "Cihaz";

// A5 = 148 × 210 mm; 8 mm kenarla kullanılabilir alan 132 × 194 mm.
const A5_CSS = `
  @page { size: A5 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #000; font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sayfa { width: 132mm; min-height: 193mm; display: flex; flex-direction: column; gap: 3mm; break-after: page; }
  .sayfa:last-child { break-after: auto; }
  .kart { display: grid; grid-template-columns: auto 1fr; gap: 4mm; align-items: center;
    border: 0.3mm dashed #000; padding: 2.5mm 3mm; break-inside: avoid; }
  .kart .ad { font-size: 11pt; font-weight: 700; }
  .kart .alt { font-size: 9pt; line-height: 1.3; }
`;

/** HTML'i gizli iframe'de açıp yazdırma penceresini gösterir. */
export function yazdir(baslik, govde, { css = "" } = {}) {
  return new Promise((cozumle, reddet) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    // display:none iframe bazı Chromium sürümlerinde boş sayfa basıyor; 0 boyut yeterli.
    Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(iframe);
    const belge = iframe.contentDocument;
    belge.open();
    belge.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${kacis(baslik)}</title><style>${A5_CSS}${css}</style></head><body>${govde}</body></html>`);
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
    { css: ADRES_ETIKETI_CSS + sayfaCss(duzen) },
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
