import { useRef } from "react";

/**
 * Etiketin ekran karşılığı. Sunucudaki lib/etiket.js ile aynı düzeni kurar:
 * logo, üstte cari bilgisi, ayıraç çizgi, altta cihaz ve arıza; vurgulu satırlar kalın.
 * Baskı öncesi ne çıkacağını görmek için — birebir piksel eşleşmesi hedeflenmez.
 * `onTasi` verilirse logo ve yazı bloğu fareyle sürüklenir.
 */

// Sunucudaki BOYUTLAR ve olcekBul ile aynı değerler — önizleme baskıdan
// sapmasın diye ikisi birlikte değiştirilmeli.
const MM = { buyuk: 5.6, orta: 3.6, kucuk: 2.8 };
const KENAR_MM = 2.5;
const REFERANS_YUKSEKLIK_MM = 50;
const olcekBul = (h) => Math.min(Math.max(0.5 + (0.5 * Number(h)) / REFERANS_YUKSEKLIK_MM, 0.68), 1.15);
const mmSayi = (deger) => {
  const metin = String(deger ?? "").trim().replace(",", ".");
  return metin === "" || !Number.isFinite(Number(metin)) ? null : Number(metin);
};
const yuvarla = (n) => Math.max(0, Math.round(n * 2) / 2);

export default function EtiketOnizleme({ etiket = {}, genislikMm = 80, yukseklikMm = 40, ayar = null, olcek = 3.6, onTasi, secili }) {
  const surukleme = useRef(null);
  const yerlesim = olcekBul(yukseklikMm);
  const yazi = yerlesim * (mmSayi(ayar?.yaziOlcek) ?? 1);
  const kenar = KENAR_MM * yerlesim;
  const metinX = mmSayi(ayar?.metinXMm) ?? kenar;
  const metinY = mmSayi(ayar?.metinYMm) ?? kenar;
  const metinGenislik = mmSayi(ayar?.metinGenislikMm) ?? Math.max(genislikMm - metinX - kenar, 5);
  const logo = ayar?.logo?.resim ? ayar.logo : null;

  const px = (mm) => `${mm * olcek}px`;
  const cihaz = [etiket.marka, etiket.model].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
  const cihazSatiri = [String(etiket.cins ?? "").trim(), cihaz].filter(Boolean).join(": ") || "Cihaz belirtilmedi";
  const kunye = [
    etiket.seriNo ? `S/N: ${etiket.seriNo}` : "",
    etiket.kabulTarihi ? `Kabul: ${etiket.kabulTarihi}` : "",
    etiket.sira || "",
  ].filter(Boolean).join("   ");

  const satir = (metin, boyut, kalin) =>
    metin ? (
      <div
        style={{
          fontSize: px(MM[boyut] * yazi * 0.78),
          lineHeight: 1.18,
          fontWeight: kalin ? 700 : 400,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: boyut === "orta" && kalin ? "normal" : "nowrap",
        }}
      >
        {metin}
      </div>
    ) : null;

  function basla(e) {
    const hedef = onTasi && e.target.closest("[data-oge]");
    if (!hedef) return;
    const oge = hedef.dataset.oge;
    const bas = oge === "logo" ? { x: mmSayi(logo.xMm) ?? 0, y: mmSayi(logo.yMm) ?? 0 } : { x: metinX, y: metinY };
    surukleme.current = { oge, x0: e.clientX, y0: e.clientY, ...bas };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function tasi(e) {
    const s = surukleme.current;
    if (!s) return;
    onTasi(s.oge, { xMm: yuvarla(s.x + (e.clientX - s.x0) / olcek), yMm: yuvarla(s.y + (e.clientY - s.y0) / olcek) });
  }

  const cerceve = (oge) => (onTasi
    ? { cursor: "move", outline: secili === oge ? "2px solid #2563eb" : "1px dashed #93b4df", outlineOffset: 1 }
    : {});

  return (
    <div
      className="relative shrink-0 select-none overflow-hidden bg-white text-black shadow-sm"
      onPointerDown={basla} onPointerMove={tasi}
      onPointerUp={() => { surukleme.current = null; }} onPointerCancel={() => { surukleme.current = null; }}
      style={{
        width: px(genislikMm),
        height: px(yukseklikMm),
        border: "1px solid #b9bfc7",
        borderRadius: 2,
        fontFamily: "Arial, Helvetica, sans-serif",
        touchAction: onTasi ? "none" : undefined,
      }}
    >
      {logo && (
        <img src={logo.resim} alt="" data-oge="logo" draggable={false}
          style={{
            position: "absolute", left: px(mmSayi(logo.xMm) ?? 0), top: px(mmSayi(logo.yMm) ?? 0),
            width: px(mmSayi(logo.genislikMm) ?? 20), filter: "grayscale(1) contrast(1.6)", ...cerceve("logo"),
          }} />
      )}
      <div data-oge="metin" style={{ position: "absolute", left: px(metinX), top: px(metinY), width: px(metinGenislik), ...cerceve("metin") }}>
        {satir(etiket.servisNo, "buyuk", true)}
        {satir(etiket.musteri, "orta", true)}
        {satir(etiket.telefon, "orta", false)}
        <div style={{ height: 2, background: "#000", margin: `${1.4 * yazi * olcek}px 0` }} />
        {satir(cihazSatiri, "orta", true)}
        {satir(kunye, "kucuk", false)}
        {satir(etiket.ariza ? `ARIZA: ${etiket.ariza}` : "", "orta", true)}
      </div>
    </div>
  );
}
