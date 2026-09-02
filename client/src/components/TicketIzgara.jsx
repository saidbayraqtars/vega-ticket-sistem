import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";

const tarih = (d) => d ? new Date(d).toLocaleDateString("tr-TR") : "—";
const tl = (n) => Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SUTUNLAR = [
  { alan: "KAPANISTARIHI", baslik: "Tarih", genislik: 110, salt: true, bicim: tarih },
  { alan: "CARIADI", baslik: "Müşteri", genislik: 300, salt: true },
  { alan: "BASLIK", baslik: "Yapılan işlem", genislik: 520 },
  { alan: "UCRET", baslik: "Söylenen ücret", genislik: 150, sayi: true, bicim: (v) => `${tl(v)} ₺` },
];
const YOKLAMA_MS = 4000;
const sirala = (rows) => [...rows].sort((a, b) => new Date(b.KAPANISTARIHI) - new Date(a.KAPANISTARIHI) || b.ID - a.ID);

export default function TicketIzgara({ firmaNo, tetik }) {
  const [kayitlar, setKayitlar] = useState([]);
  const [duzenlenen, setDuzenlenen] = useState(null);
  const [taslak, setTaslak] = useState("");
  const [uyari, setUyari] = useState(null);
  const [silinecek, setSilinecek] = useState(null);
  const [siliniyor, setSiliniyor] = useState(false);
  const sonRv = useRef(null);

  const ilkYukle = useCallback(async () => {
    const r = await api.ticketListe({ firma: firmaNo });
    setKayitlar(r.kayitlar);
    sonRv.current = r.kayitlar.reduce((m, k) => !m || k.RV > m ? k.RV : m, null);
  }, [firmaNo]);

  useEffect(() => { ilkYukle().catch((e) => setUyari(e.message)); }, [ilkYukle, tetik]);
  useEffect(() => {
    const zamanlayici = setInterval(async () => {
      if (duzenlenen) return;
      try {
        const r = await api.ticketDegisiklikler({ firma: firmaNo, sonRv: sonRv.current || "" });
        if (!r.kayitlar.length) return;
        sonRv.current = r.sonRv;
        setKayitlar((onceki) => {
          const harita = new Map(onceki.map((k) => [k.ID, k]));
          for (const k of r.kayitlar) k.SILINDI ? harita.delete(k.ID) : harita.set(k.ID, k);
          return sirala([...harita.values()]);
        });
      } catch { /* sonraki yoklamada yeniden denenir */ }
    }, YOKLAMA_MS);
    return () => clearInterval(zamanlayici);
  }, [firmaNo, duzenlenen]);

  function duzenle(kayit, sutun) {
    if (sutun.salt) return;
    setDuzenlenen({ id: kayit.ID, alan: sutun.alan });
    setTaslak(kayit[sutun.alan] ?? "");
  }
  async function kaydet(kayit, sutun) {
    setDuzenlenen(null);
    if (String(taslak) === String(kayit[sutun.alan] ?? "")) return;
    try {
      const r = await api.ticketGuncelle(kayit.ID, { [sutun.alan]: taslak, RV: kayit.RV });
      setKayitlar((rows) => rows.map((x) => x.ID === r.kayit.ID ? r.kayit : x));
      if (r.kayit.RV > (sonRv.current || "")) sonRv.current = r.kayit.RV;
    } catch (err) {
      if (err.govde?.cakisma && err.govde.kayit) {
        setKayitlar((rows) => rows.map((x) => x.ID === err.govde.kayit.ID ? err.govde.kayit : x));
      }
      setUyari(err.message);
    }
  }

  async function sil() {
    if (!silinecek) return;
    setSiliniyor(true);
    try {
      await api.ticketSil(silinecek.ID);
      setKayitlar((rows) => rows.filter((x) => x.ID !== silinecek.ID));
      setSilinecek(null);
    } catch (err) {
      setUyari(err.message);
    } finally {
      setSiliniyor(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b bg-white px-4 py-2">
        <span className="font-semibold">Tamamlanan işlemler</span>
        <span className="ml-2 text-[12px] text-gray-500">{kayitlar.length} kayıt</span>
      </div>
      {uyari && <div className="flex border-b border-red-200 bg-red-50 px-3 py-1.5 text-red-700"><span className="flex-1">{uyari}</span><button onClick={() => setUyari(null)}>×</button></div>}
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        <table className="izgara">
          <colgroup>{SUTUNLAR.map((s) => <col key={s.alan} style={{ width: s.genislik }} />)}<col style={{ width: 44 }} /></colgroup>
          <thead><tr>{SUTUNLAR.map((s) => <th key={s.alan}>{s.baslik}</th>)}<th style={{ width: 44 }} /></tr></thead>
          <tbody>
            {kayitlar.map((k) => <tr key={k.ID}>{SUTUNLAR.map((s) => {
              const aktif = duzenlenen?.id === k.ID && duzenlenen?.alan === s.alan;
              const goster = s.bicim ? s.bicim(k[s.alan]) : k[s.alan] ?? "";
              return <td key={s.alan} className={s.sayi ? "sayi" : undefined}
                onClick={() => !aktif && duzenle(k, s)} style={{ cursor: s.salt ? "default" : "text", padding: aktif ? 0 : undefined }} title={String(goster)}>
                {aktif ? <input autoFocus className="hucre-giris" inputMode={s.sayi ? "decimal" : undefined}
                  style={s.sayi ? { textAlign: "right" } : undefined} value={taslak}
                  onChange={(e) => setTaslak(e.target.value)} onBlur={() => kaydet(k, s)}
                  onKeyDown={(e) => { if (e.key === "Enter") kaydet(k, s); if (e.key === "Escape") setDuzenlenen(null); }} /> : goster}
              </td>;
            })}<td style={{ textAlign: "center", padding: 0 }}>
              <button type="button" title="Bu kaydı sil" onClick={() => setSilinecek(k)}
                className="px-2 py-0.5 text-[13px] leading-none text-gray-400 hover:text-red-700">×</button>
            </td></tr>)}
            {!kayitlar.length && <tr><td colSpan={SUTUNLAR.length + 1} className="py-8 text-center text-gray-500">Henüz tamamlanan işlem yok.</td></tr>}
          </tbody>
        </table>
      </div>

      {silinecek && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/35 p-4"
          onClick={() => !siliniyor && setSilinecek(null)}>
          <div className="w-[440px] rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-[14px] font-semibold">İşlem kaydı silinsin mi?</div>
            <div className="mt-2 rounded border border-[#dfe3e8] bg-[#fbfcfd] px-3 py-2 text-[12px]">
              <div className="font-semibold">{silinecek.CARIADI}</div>
              <div className="mt-0.5">{silinecek.BASLIK}</div>
              <div className="mt-0.5 text-gray-500">
                {tarih(silinecek.KAPANISTARIHI)} · {tl(silinecek.UCRET)} ₺
              </div>
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              Kayıt listeden kalkar ve tüm bilgisayarlarda görünmez olur. Geçmişte kalır,
              veritabanından tamamen silinmez.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setSilinecek(null)} disabled={siliniyor}
                className="rounded border border-[#c7ccd4] px-4 py-1.5 text-[12px] disabled:opacity-40">Vazgeç</button>
              <button onClick={sil} disabled={siliniyor}
                className="rounded bg-red-600 px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
                {siliniyor ? "Siliniyor…" : "Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
