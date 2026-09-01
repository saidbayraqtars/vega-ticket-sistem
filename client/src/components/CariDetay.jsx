import { useEffect, useState } from "react";
import { api } from "../api/client";

const tl = (n) => Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tarih = (d) => d ? new Date(d).toLocaleDateString("tr-TR") : "—";
const bugunYerel = () => {
  const d = new Date();
  const iki = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
};

export default function CariDetay({ firmaNo, donemNo, cariInd, onTicketDegisti, onMusteriDegisti }) {
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState(null);
  const [form, setForm] = useState({ baslik: "", ucret: "" });
  const [sureForm, setSureForm] = useState({ baslangic: bugunYerel(), sureAy: 1 });
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [sureKaydediliyor, setSureKaydediliyor] = useState(false);

  async function detayYukle(ind = cariInd) {
    const r = await api.cariDetay(ind, { firma: firmaNo, donem: donemNo });
    setVeri(r);
    const s = r.kart.sure;
    setSureForm({ baslangic: s?.baslangicISO || bugunYerel(), sureAy: s?.sureAy || 1 });
    return r;
  }

  useEffect(() => {
    if (!cariInd) { setVeri(null); return; }
    let iptal = false;
    setVeri(null);
    setHata(null);
    setForm({ baslik: "", ucret: "" });
    api.cariDetay(cariInd, { firma: firmaNo, donem: donemNo })
      .then((r) => {
        if (iptal) return;
        setVeri(r);
        const s = r.kart.sure;
        setSureForm({ baslangic: s?.baslangicISO || bugunYerel(), sureAy: s?.sureAy || 1 });
      })
      .catch((e) => !iptal && setHata(e.message));
    return () => { iptal = true; };
  }, [cariInd, firmaNo, donemNo]);

  async function islemEkle(e) {
    e.preventDefault();
    if (!form.baslik.trim() || !veri) return;
    setKaydediliyor(true);
    setHata(null);
    try {
      await api.ticketOlustur({
        FIRMANO: firmaNo,
        DONEMNO: donemNo,
        CARIIND: veri.kart.IND,
        BASLIK: form.baslik.trim(),
        UCRET: form.ucret,
      });
      setForm({ baslik: "", ucret: "" });
      await detayYukle();
      onTicketDegisti?.();
    } catch (err) {
      setHata(err.message);
    } finally {
      setKaydediliyor(false);
    }
  }

  async function sureKaydet(e) {
    e.preventDefault();
    setSureKaydediliyor(true);
    setHata(null);
    try {
      const r = await api.cariSureKaydet(cariInd, {
        firma: firmaNo,
        donem: donemNo,
        baslangic: sureForm.baslangic,
        sureAy: Number(sureForm.sureAy),
      });
      setVeri((v) => ({ ...v, kart: r.kart }));
      onMusteriDegisti?.();
    } catch (err) {
      setHata(err.message);
    } finally {
      setSureKaydediliyor(false);
    }
  }

  if (!cariInd) return <div className="flex h-full items-center justify-center px-6 text-center text-gray-500">Listeden müşteri seçin veya üstten arayın.</div>;
  if (hata && !veri) return <div className="p-4 text-red-700">{hata}</div>;
  if (!veri) return <div className="p-4 text-gray-500">Yükleniyor…</div>;

  const { kart, ozet, ticketlar } = veri;
  const bakiyeSinif = ozet.bakiye > 0.005 ? "text-red-700" : ozet.bakiye < -0.005 ? "text-emerald-700" : "text-gray-700";

  return (
    <div className="flex h-full flex-col bg-[#fbfcfd]">
      <div className="border-b bg-white px-4 py-3">
        <div className="truncate text-[16px] font-semibold">{kart.AD}</div>
        <div className="font-mono text-[11px] text-gray-500">{kart.FIRMAKODU}</div>
        <div className={`mt-3 rounded border px-3 py-2 ${bakiyeSinif}`}>
          <div className="text-[11px] uppercase tracking-wide">Cari borç durumu</div>
          <div className="text-[20px] font-semibold tabular-nums">{tl(ozet.bakiye)} ₺</div>
          <div className="text-[11px] text-gray-500">Borç {tl(ozet.borc)} ₺ · Alacak {tl(ozet.alacak)} ₺</div>
        </div>
      </div>

      <form onSubmit={sureKaydet} className="border-b bg-white px-4 py-3">
        <div className="mb-2 text-[12px] font-semibold">Yeni müşteri süresi</div>
        <div className="grid grid-cols-[1fr_105px_auto] gap-2">
          <input type="date" required value={sureForm.baslangic}
            onChange={(e) => setSureForm({ ...sureForm, baslangic: e.target.value })}
            className="rounded border border-[#c7ccd4] px-2 py-1.5" />
          <select value={sureForm.sureAy} onChange={(e) => setSureForm({ ...sureForm, sureAy: Number(e.target.value) })}
            className="rounded border border-[#c7ccd4] px-2 py-1.5">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((ay) => <option key={ay} value={ay}>{ay} ay</option>)}
          </select>
          <button disabled={sureKaydediliyor} className="rounded bg-slate-700 px-3 py-1.5 text-white disabled:opacity-50">
            {sureKaydediliyor ? "…" : "Süreyi kaydet"}
          </button>
        </div>
        <div className="mt-1.5 text-[11px] text-gray-500">Bitiş: {kart.sure?.bitis || "—"}</div>
      </form>

      <form onSubmit={islemEkle} className="border-b bg-blue-50 px-4 py-3">
        <div className="mb-2 text-[13px] font-semibold">İşlem kaydı</div>
        <textarea required maxLength={200} rows={3} value={form.baslik}
          onChange={(e) => setForm({ ...form, baslik: e.target.value })}
          placeholder="Yapılan işlem"
          className="w-full resize-none rounded border border-[#c7ccd4] bg-white px-3 py-2 outline-none focus:border-blue-500" />
        <div className="mt-2 flex gap-2">
          <input inputMode="decimal" value={form.ucret}
            onChange={(e) => setForm({ ...form, ucret: e.target.value })}
            placeholder="Söylenen ücret ₺"
            className="min-w-0 flex-1 rounded border border-[#c7ccd4] bg-white px-3 py-2 text-right outline-none focus:border-blue-500" />
          <button disabled={kaydediliyor || !form.baslik.trim()} className="rounded bg-blue-600 px-5 py-2 font-semibold text-white disabled:opacity-40">
            {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
        {hata && <div className="mt-2 text-[12px] text-red-700">{hata}</div>}
      </form>

      <div className="border-b bg-[#eef1f5] px-3 py-2 text-[12px] font-semibold">Bitmiş işlemler ({ticketlar.length})</div>
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        <table className="izgara">
          <thead><tr><th style={{ width: 92 }}>Tarih</th><th>Yapılan işlem</th><th style={{ width: 115 }}>Söylenen ücret</th></tr></thead>
          <tbody>
            {ticketlar.map((t) => <tr key={t.ID}><td>{tarih(t.KAPANISTARIHI)}</td><td title={t.BASLIK}>{t.BASLIK}</td><td className="sayi">{tl(t.UCRET)} ₺</td></tr>)}
            {!ticketlar.length && <tr><td colSpan={3} className="py-6 text-center text-gray-500">Henüz işlem kaydı yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
