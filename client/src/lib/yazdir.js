import { barkodSvg } from "./code128";

/**
 * A5 adres etiketi ve barkod çıktısı. Termal etiket yazıcısından farklı olarak
 * normal (A4/A5) yazıcıya gider: sayfa gizli bir iframe'e yazılıp tarayıcının
 * yazdırma penceresi açılır, yazıcı ve kâğıt orada seçilir.
 */

const kacis = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const cokSatir = (s) => kacis(String(s ?? "").trim()).replace(/\n+/g, "<br>");
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
  .ust { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 0.8mm solid #000; padding-bottom: 1.5mm; }
  .ust .tur { font-size: 17pt; font-weight: 800; letter-spacing: 0.4pt; }
  .ust .bilgi { text-align: right; font-size: 9pt; line-height: 1.35; }
  .kutu { border: 0.4mm solid #000; border-radius: 1.5mm; padding: 2.5mm 3.5mm; }
  .baslik { font-size: 7.5pt; font-weight: 700; letter-spacing: 1pt; margin-bottom: 1mm; }
  .gonderen { font-size: 9.5pt; line-height: 1.3; }
  .alici { border-width: 0.9mm; }
  .alici .ad { font-size: 19pt; font-weight: 800; line-height: 1.15; }
  .alici .satir { font-size: 12.5pt; line-height: 1.3; margin-top: 1mm; }
  .alici .il { font-size: 15pt; font-weight: 800; margin-top: 1.5mm; }
  .barkod { text-align: center; }
  .barkod svg { max-width: 100%; }
  .iki { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; font-size: 10pt; }
  .iki b { display: block; font-size: 7.5pt; letter-spacing: 1pt; }
  table.icerik { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  table.icerik th, table.icerik td { border: 0.25mm solid #000; padding: 0.8mm 1.2mm; text-align: left; vertical-align: top; }
  .not { font-size: 9pt; }
  .kart { display: grid; grid-template-columns: auto 1fr; gap: 4mm; align-items: center;
    border: 0.3mm dashed #000; padding: 2.5mm 3mm; break-inside: avoid; }
  .kart .ad { font-size: 11pt; font-weight: 700; }
  .kart .alt { font-size: 9pt; line-height: 1.3; }
`;

/** HTML'i gizli iframe'de açıp yazdırma penceresini gösterir. */
export function yazdir(baslik, govde) {
  return new Promise((cozumle, reddet) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    // display:none iframe bazı Chromium sürümlerinde boş sayfa basıyor; 0 boyut yeterli.
    Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(iframe);
    const belge = iframe.contentDocument;
    belge.open();
    belge.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${kacis(baslik)}</title><style>${A5_CSS}</style></head><body>${govde}</body></html>`);
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

/** Paketin üstüne yapıştırılan A5 gönderim etiketi: alıcı, gönderen, barkod, içerik. */
export function adresEtiketiHtml({ kayit, gonderim, gonderen }) {
  const ariza = gonderim.TUR === "ARIZA";
  const cihazlar = kayit.cihazlar || [];
  const icerik = cihazlar.map((c) => `
    <tr><td>${kacis(c.SIRA)}</td><td>${kacis(cihazAdi(c))}</td><td>${kacis(c.SERINO || "")}</td>
    <td>${kacis(ariza ? c.ARIZA || "" : c.YAPILANISLEM || c.ARIZA || "")}</td></tr>`).join("");
  const takip = String(gonderim.TAKIPNO || "").trim();

  return `
  <div class="sayfa">
    <div class="ust">
      <div class="tur">${ariza ? "ARIZA GÖNDERİMİ" : "KARGO GÖNDERİMİ"}</div>
      <div class="bilgi">${kacis(kayit.SERVISNO)}<br>${tarihTR(gonderim.TARIH || new Date())}</div>
    </div>

    <div class="kutu gonderen">
      <div class="baslik">GÖNDEREN</div>
      <b>${kacis(gonderen?.ad || "")}</b><br>
      ${gonderen?.adres ? `${cokSatir(gonderen.adres)}<br>` : ""}
      ${kacis(gonderen?.il || "")}${gonderen?.telefon ? ` · Tel: ${kacis(gonderen.telefon)}` : ""}
    </div>

    <div class="kutu alici">
      <div class="baslik">ALICI</div>
      <div class="ad">${kacis(gonderim.ALICIADI)}</div>
      ${gonderim.ALICIYETKILI ? `<div class="satir">Yetkili: ${kacis(gonderim.ALICIYETKILI)}</div>` : ""}
      ${gonderim.ALICITELEFON ? `<div class="satir">Tel: <b>${kacis(gonderim.ALICITELEFON)}</b></div>` : ""}
      ${gonderim.ALICIADRES ? `<div class="satir">${cokSatir(gonderim.ALICIADRES)}</div>` : ""}
      ${gonderim.ALICIIL ? `<div class="il">${kacis(gonderim.ALICIIL)}</div>` : ""}
    </div>

    <div class="barkod">${barkodSvg(kayit.SERVISNO, { modul: 0.5, enFazlaGenislik: 125, yukseklik: 20, yaziBoyu: 4 })}</div>

    <div class="iki">
      <div><b>KARGO FİRMASI</b>${kacis(gonderim.KARGOFIRMASI || "—")}</div>
      <div><b>TAKİP NO</b>${kacis(takip || "—")}</div>
    </div>
    ${takip ? `<div class="barkod">${barkodSvg(takip, { modul: 0.38, enFazlaGenislik: 125, yukseklik: 12 })}</div>` : ""}

    <table class="icerik">
      <thead><tr><th style="width:7mm">#</th><th>Cihaz</th><th style="width:30mm">Seri no</th><th>${ariza ? "Arıza" : "Yapılan işlem"}</th></tr></thead>
      <tbody>${icerik || `<tr><td colspan="4">—</td></tr>`}</tbody>
    </table>
    ${gonderim.NOTU ? `<div class="not"><b>Not:</b> ${cokSatir(gonderim.NOTU)}</div>` : ""}
  </div>`;
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
