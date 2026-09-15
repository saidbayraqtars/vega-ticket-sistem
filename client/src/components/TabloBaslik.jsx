/**
 * Sıralanabilir başlık + altında sütun filtre satırı. `tablo` useTablo'dan gelir;
 * sunucu tarafında filtrelenen listeler de aynı nesne biçimini verir.
 * `ekSutunlar` sağdaki işlem sütunları için boş hücre sayısı.
 */
export default function TabloBaslik({ sutunlar, tablo, ekSutunlar = 0 }) {
  return (
    <thead>
      <tr>
        {sutunlar.map((s) => {
          const aktif = tablo.sirala === s.anahtar;
          return (
            <th key={s.anahtar}
              onClick={() => !s.siralanmaz && tablo.siralamaDegistir(s.anahtar)}
              style={{ cursor: s.siralanmaz ? "default" : "pointer" }}
              title={s.siralanmaz ? undefined : "Sıralamak için tıklayın"}>
              {s.baslik}
              {aktif && <span className="text-blue-700">{tablo.yon === "asc" ? " ▲" : " ▼"}</span>}
            </th>
          );
        })}
        {Array.from({ length: ekSutunlar }, (_, i) => <th key={`ek${i}`} />)}
      </tr>
      <tr className="filtre-satiri">
        {sutunlar.map((s) => {
          const deger = tablo.filtreler[s.anahtar] ?? "";
          if (s.filtresiz) return <th key={s.anahtar} />;
          return (
            <th key={s.anahtar}>
              {s.tip === "secim" ? (
                <select className="filtre-giris" data-dolu={deger ? "1" : undefined} value={deger}
                  onChange={(e) => tablo.filtreDegistir(s.anahtar, e.target.value)}>
                  <option value="">Tümü</option>
                  {s.secenekler.map((o) => (
                    <option key={o.deger} value={o.deger}>{o.ad}{o.adet != null ? ` (${o.adet})` : ""}</option>
                  ))}
                </select>
              ) : (
                <input className="filtre-giris" data-dolu={deger ? "1" : undefined} value={deger}
                  placeholder="filtre…" onChange={(e) => tablo.filtreDegistir(s.anahtar, e.target.value)} />
              )}
            </th>
          );
        })}
        {Array.from({ length: ekSutunlar }, (_, i) => <th key={`ek${i}`} />)}
      </tr>
    </thead>
  );
}
