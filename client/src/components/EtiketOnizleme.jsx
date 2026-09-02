/**
 * Etiketin ekran karşılığı. Sunucudaki lib/etiket.js ile aynı düzeni kurar:
 * üstte cari bilgisi, ayıraç çizgi, altta cihaz ve arıza; vurgulu satırlar kalın.
 * Baskı öncesi ne çıkacağını görmek için — birebir piksel eşleşmesi hedeflenmez.
 */

// Sunucudaki BOYUTLAR ve olcekBul ile aynı değerler — önizleme baskıdan
// sapmasın diye ikisi birlikte değiştirilmeli.
const MM = { buyuk: 5.6, orta: 3.6, kucuk: 2.8 };
const KENAR_MM = 2.5;
const REFERANS_YUKSEKLIK_MM = 50;
const olcekBul = (h) => Math.min(Math.max(0.5 + (0.5 * Number(h)) / REFERANS_YUKSEKLIK_MM, 0.68), 1.15);

export default function EtiketOnizleme({ etiket = {}, genislikMm = 80, yukseklikMm = 40, olcek = 3.6 }) {
  const yerlesim = olcekBul(yukseklikMm);
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
          fontSize: px(MM[boyut] * yerlesim * 0.78),
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

  return (
    <div
      className="shrink-0 overflow-hidden bg-white text-black shadow-sm"
      style={{
        width: px(genislikMm),
        height: px(yukseklikMm),
        padding: px(KENAR_MM * yerlesim),
        border: "1px solid #b9bfc7",
        borderRadius: 2,
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      {satir(etiket.servisNo, "buyuk", true)}
      {satir(etiket.musteri, "orta", true)}
      {satir(etiket.telefon, "orta", false)}
      <div style={{ height: 2, background: "#000", margin: `${1.4 * yerlesim * olcek}px 0` }} />
      {satir(cihazSatiri, "orta", true)}
      {satir(kunye, "kucuk", false)}
      {satir(etiket.ariza ? `ARIZA: ${etiket.ariza}` : "", "orta", true)}
    </div>
  );
}
