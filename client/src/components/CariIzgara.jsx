const tl = (n) => Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const borc = (r) => {
  if (r.borcDurumu === "BORCLU") return { yazi: "Borçlu", sinif: "text-red-700 font-semibold" };
  if (r.borcDurumu === "ALACAKLI") return { yazi: "Alacaklı", sinif: "text-emerald-700 font-semibold" };
  return { yazi: "Borcu yok", sinif: "text-gray-500" };
};

const SUTUNLAR = [
  { anahtar: "kod", baslik: "Cari Kodu", genislik: 135, deger: (r) => r.FIRMAKODU },
  { anahtar: "ad", baslik: "Müşteri", genislik: 360, deger: (r) => r.AD },
  { anahtar: null, baslik: "Borç Durumu", genislik: 120, ozel: true },
  { anahtar: "bakiye", baslik: "Bakiye", genislik: 135, sayi: true, deger: (r) => `${tl(r.BAKIYE)} ₺` },
  { anahtar: null, baslik: "Tanımlı Süre", genislik: 125, deger: (r) => r.sure?.sureAy ? `${r.sure.sureAy} ay` : "—" },
  { anahtar: "bitis", baslik: "Süre Bitişi", genislik: 120, deger: (r) => r.sure?.bitis || "—" },
];

export default function CariIzgara({ kayitlar, seciliInd, onSec, sirala, yon, onSirala }) {
  return (
    <div className="h-full overflow-auto bg-white">
      <table className="izgara">
        <colgroup>{SUTUNLAR.map((s, i) => <col key={i} style={{ width: s.genislik }} />)}</colgroup>
        <thead><tr>{SUTUNLAR.map((s, i) => (
          <th key={i} onClick={() => s.anahtar && onSirala(s.anahtar)}
            style={{ cursor: s.anahtar ? "pointer" : "default" }}>
            {s.baslik}{sirala === s.anahtar && (yon === "asc" ? " ▲" : " ▼")}
          </th>
        ))}</tr></thead>
        <tbody>
          {kayitlar.map((r) => {
            const durum = borc(r);
            return (
              <tr key={r.IND} data-secili={r.IND === seciliInd ? "1" : "0"} onClick={() => onSec(r)} style={{ cursor: "pointer" }}>
                {SUTUNLAR.map((s, i) => (
                  <td key={i} className={s.ozel ? durum.sinif : s.sayi ? "sayi" : undefined}
                    title={s.ozel ? durum.yazi : String(s.deger(r))}>
                    {s.ozel ? durum.yazi : s.deger(r)}
                  </td>
                ))}
              </tr>
            );
          })}
          {!kayitlar.length && <tr><td colSpan={SUTUNLAR.length} className="py-8 text-center text-gray-500">Müşteri bulunamadı.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
