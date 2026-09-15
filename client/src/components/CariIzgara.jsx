import TabloBaslik from "./TabloBaslik";

const tl = (n) => Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BORC = {
  BORCLU: { yazi: "Borçlu", sinif: "text-red-700 font-semibold" },
  ALACAKLI: { yazi: "Alacaklı", sinif: "text-emerald-700 font-semibold" },
  BORCU_YOK: { yazi: "Borcu yok", sinif: "text-gray-500" },
};
const borc = (r) => BORC[r.borcDurumu] || BORC.BORCU_YOK;

const TUR_ADLARI = { "ANLAŞMALI": "Anlaşmalı", "YENİ MÜŞTERİ": "Yeni müşteri", TANIMSIZ: "Tanımsız" };
const SURE_ADLARI = { aktif: "Süresi var", bitiyor: "Bitiyor (30 gün)", doldu: "Süresi doldu", yok: "Süre yok" };
const TUR_SINIF = { "ANLAŞMALI": "text-emerald-800 font-semibold", "YENİ MÜŞTERİ": "text-blue-800" };

const secenek = (adlar, ozet) => Object.entries(adlar).map(([deger, ad]) => ({ deger, ad, adet: ozet?.[deger] }));

/**
 * Müşteri listesi. Sıralama ve filtre sunucuda uygulanır (liste sayfalı);
 * anahtarlar /api/cari/liste parametreleriyle birebir aynıdır.
 */
export default function CariIzgara({ kayitlar, seciliInd, onSec, tablo, ozet }) {
  const sutunlar = [
    { anahtar: "kod", baslik: "Cari Kodu", genislik: 135, hucre: (r) => r.FIRMAKODU },
    { anahtar: "ad", baslik: "Müşteri", genislik: 360, hucre: (r) => r.AD },
    {
      anahtar: "tur", baslik: "Müşteri Türü", genislik: 150, tip: "secim", secenekler: secenek(TUR_ADLARI, ozet?.tur),
      hucre: (r) => TUR_ADLARI[r.sure?.tur] || "Tanımsız", sinif: (r) => TUR_SINIF[r.sure?.tur],
      ipucu: (r) => (r.KOD1 ? `Vega özel kod 1: ${r.KOD1}` : "Vega özel kod 1 boş"),
    },
    {
      anahtar: "borc", baslik: "Borç Durumu", genislik: 120, tip: "secim", secenekler: secenek({ BORCLU: "Borçlu", ALACAKLI: "Alacaklı", BORCU_YOK: "Borcu yok" }, ozet?.borc),
      hucre: (r) => borc(r).yazi, sinif: (r) => borc(r).sinif,
    },
    { anahtar: "bakiye", baslik: "Bakiye", genislik: 135, filtresiz: true, sayi: true, hucre: (r) => `${tl(r.BAKIYE)} ₺` },
    {
      anahtar: "sure", baslik: "Tanımlı Süre", genislik: 125, tip: "secim", secenekler: secenek(SURE_ADLARI, ozet?.sure),
      hucre: (r) => (r.sure?.sureAy ? `${r.sure.sureAy} ay` : "—"),
    },
    { anahtar: "bitis", baslik: "Süre Bitişi", genislik: 120, filtresiz: true, hucre: (r) => r.sure?.bitis || "—" },
  ];

  return (
    <div className="h-full overflow-auto bg-white">
      <table className="izgara">
        <colgroup>{sutunlar.map((s) => <col key={s.anahtar} style={{ width: s.genislik }} />)}</colgroup>
        <TabloBaslik sutunlar={sutunlar} tablo={tablo} />
        <tbody>
          {kayitlar.map((r) => (
            <tr key={r.IND} data-secili={r.IND === seciliInd ? "1" : "0"} onClick={() => onSec(r)} style={{ cursor: "pointer" }}>
              {sutunlar.map((s) => {
                const deger = s.hucre(r);
                return (
                  <td key={s.anahtar} className={[s.sayi ? "sayi" : "", s.sinif?.(r) || ""].join(" ").trim() || undefined}
                    title={s.ipucu ? s.ipucu(r) : String(deger)}>
                    {deger}
                  </td>
                );
              })}
            </tr>
          ))}
          {!kayitlar.length && <tr><td colSpan={sutunlar.length} className="py-8 text-center text-gray-500">Müşteri bulunamadı.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
