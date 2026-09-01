import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

const tl = (n) => Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const borcEtiketi = (k) => k.borcDurumu === "BORCLU" ? "Borçlu" : k.borcDurumu === "ALACAKLI" ? "Alacaklı" : "Borcu yok";

export default function Arama({ firmaNo, donemNo, onSec }) {
  const [q, setQ] = useState("");
  const [sonuc, setSonuc] = useState(null);
  const [acik, setAcik] = useState(false);
  const [vurgu, setVurgu] = useState(0);
  const [yukleniyor, setYukleniyor] = useState(false);
  const kutuRef = useRef(null);
  const sonIstek = useRef(0);

  useEffect(() => {
    if (!q.trim()) {
      setSonuc(null);
      setAcik(false);
      return;
    }
    const damga = ++sonIstek.current;
    setYukleniyor(true);
    const zamanlayici = setTimeout(async () => {
      try {
        const r = await api.cariAra({ firma: firmaNo, donem: donemNo, q, limit: 15 });
        if (damga === sonIstek.current) {
          setSonuc(r);
          setVurgu(0);
          setAcik(true);
        }
      } catch {
        if (damga === sonIstek.current) setSonuc(null);
      } finally {
        if (damga === sonIstek.current) setYukleniyor(false);
      }
    }, 180);
    return () => clearTimeout(zamanlayici);
  }, [q, firmaNo, donemNo]);

  useEffect(() => {
    const disariTikla = (e) => kutuRef.current && !kutuRef.current.contains(e.target) && setAcik(false);
    document.addEventListener("mousedown", disariTikla);
    return () => document.removeEventListener("mousedown", disariTikla);
  }, []);

  const kayitlar = sonuc?.kayitlar ?? [];
  function sec(kayit) {
    if (!kayit) return;
    setQ("");
    setSonuc(null);
    setAcik(false);
    onSec(kayit);
  }
  function tusaBas(e) {
    if (!acik || !kayitlar.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setVurgu((v) => Math.min(v + 1, kayitlar.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setVurgu((v) => Math.max(v - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); sec(kayitlar[vurgu]); }
    else if (e.key === "Escape") setAcik(false);
  }

  return (
    <div ref={kutuRef} className="relative w-full">
      <input
        className="w-full rounded-lg border-2 border-blue-500 bg-white px-5 py-3 text-[18px] shadow-sm outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
        placeholder="Müşteri ara — ünvan, cari kodu, yetkili veya telefon"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => sonuc && setAcik(true)}
        onKeyDown={tusaBas}
        autoComplete="off"
      />
      {yukleniyor && <span className="pointer-events-none absolute right-4 top-4 text-[12px] text-gray-400">aranıyor…</span>}
      {acik && sonuc && (
        <div className="absolute z-30 mt-1 max-h-[440px] w-full overflow-auto rounded border border-[#c7ccd4] bg-white shadow-xl">
          {sonuc.oneri && (
            <div className="border-b bg-amber-50 px-4 py-2 text-[12px]">
              Şunu mu demek istediniz: <button className="font-semibold text-blue-700" onClick={() => setQ(sonuc.oneri.sorgu)}>{sonuc.oneri.sorgu}</button>
            </div>
          )}
          {!kayitlar.length && <div className="px-4 py-6 text-center text-gray-500">Sonuç bulunamadı.</div>}
          {kayitlar.map((k, i) => (
            <button key={k.IND} onClick={() => sec(k)} onMouseEnter={() => setVurgu(i)}
              className={`grid w-full grid-cols-[130px_1fr_110px_130px] items-center gap-3 border-b px-4 py-2 text-left ${i === vurgu ? "bg-blue-50" : "hover:bg-gray-50"}`}>
              <span className="font-mono text-[12px] text-gray-500">{k.FIRMAKODU}</span>
              <span className="truncate font-medium">{k.AD}</span>
              <span className={k.borcDurumu === "BORCLU" ? "text-red-700" : "text-gray-600"}>{borcEtiketi(k)}</span>
              <span className="text-right tabular-nums">{tl(k.BAKIYE)} ₺</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
