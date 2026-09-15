import { useEffect, useState } from "react";
import { api, kullaniciAl } from "../api/client";
import { mesajOnizle, VARSAYILAN_MESAJ_SABLONU } from "../lib/whatsappSablon";

const tl = (n) => Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tarih = (d) => d ? new Date(d).toLocaleDateString("tr-TR") : "—";
const bugunYerel = () => {
  const d = new Date();
  const iki = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
};
const bosIslemFormu = { baslik: "", ucret: "", whatsappSablonu: VARSAYILAN_MESAJ_SABLONU };

export default function CariDetay({ firmaNo, donemNo, cariInd, yenilemeTetik, onTicketDegisti, onMusteriDegisti }) {
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState(null);
  const [form, setForm] = useState(bosIslemFormu);
  const [sureForm, setSureForm] = useState({ baslangic: bugunYerel(), sureAy: 1 });
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [sureKaydediliyor, setSureKaydediliyor] = useState(false);
  const [waBildirim, setWaBildirim] = useState(null);
  const [waIslemde, setWaIslemde] = useState(false);
  const [waSablon, setWaSablon] = useState(VARSAYILAN_MESAJ_SABLONU);

  async function detayYukle(ind = cariInd) {
    const r = await api.cariDetay(ind, { firma: firmaNo, donem: donemNo });
    setVeri(r);
    const s = r.kart.sure;
    setSureForm({ baslangic: s?.baslangicISO || bugunYerel(), sureAy: s?.sureAy || 1 });
    return r;
  }

  useEffect(() => {
    api.whatsappSablon().then((r) => {
      setWaSablon(r.sablon);
      setForm((onceki) => ({
        ...onceki,
        whatsappSablonu: onceki.whatsappSablonu === VARSAYILAN_MESAJ_SABLONU ? r.sablon : onceki.whatsappSablonu,
      }));
    }).catch(() => { /* varsayılan şablonla devam edilir */ });
  }, []);

  useEffect(() => {
    if (!cariInd) { setVeri(null); return; }
    let iptal = false;
    setVeri(null);
    setHata(null);
    setForm({ ...bosIslemFormu, whatsappSablonu: waSablon });
    setWaBildirim(null);
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

  // Liste tazelenince açık kart da Vega'daki güncel türü göstersin. Yazılmakta
  // olan işlem formuna dokunulmaz, yalnız kart verisi yenilenir.
  useEffect(() => {
    if (!cariInd || !yenilemeTetik) return undefined;
    let iptal = false;
    api.cariDetay(cariInd, { firma: firmaNo, donem: donemNo })
      .then((r) => { if (!iptal) setVeri(r); })
      .catch(() => { /* bir sonraki tazelemede yeniden denenir */ });
    return () => { iptal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yenilemeTetik]);

  useEffect(() => {
    if (!waBildirim?.sirada || !waBildirim?.ticketId) return undefined;
    let iptal = false;
    const yenile = async () => {
      try {
        const r = await api.whatsappMesajDurumu(waBildirim.ticketId);
        if (!iptal) setWaBildirim(r.whatsapp);
      } catch {
        // Kuyruk yoklaması geçici olarak aksarsa işlem kaydı ve ana ekran etkilenmez.
      }
    };
    const timer = setInterval(yenile, 2000);
    return () => { iptal = true; clearInterval(timer); };
  }, [waBildirim?.sirada, waBildirim?.ticketId]);

  async function islemEkle(e) {
    e.preventDefault();
    if (!form.baslik.trim() || !veri) return;
    setKaydediliyor(true);
    setHata(null);
    try {
      const islem = form.baslik.trim();
      const r = await api.ticketOlustur({
        FIRMANO: firmaNo,
        DONEMNO: donemNo,
        CARIIND: veri.kart.IND,
        BASLIK: islem,
        UCRET: form.ucret,
        WHATSAPPSABLONU: form.whatsappSablonu,
      });
      setWaBildirim(r.whatsapp);
      setForm({ ...bosIslemFormu, whatsappSablonu: waSablon });
      await detayYukle();
      onTicketDegisti?.();
    } catch (err) {
      setHata(err.message);
    } finally {
      setKaydediliyor(false);
    }
  }

  async function whatsappTekrarGonder() {
    if (!waBildirim?.ticketId || waBildirim?.iptal) return;
    setWaIslemde(true);
    try {
      const r = await api.whatsappGonder({
        firma: firmaNo,
        donem: donemNo,
        ticketId: waBildirim.ticketId,
      });
      setWaBildirim(r.whatsapp);
    } catch (err) {
      setWaBildirim((onceki) => ({
        ...onceki,
        ...(err.govde?.whatsapp || {}),
        gonderildi: false,
        iptal: err.durum === 410 || err.govde?.iptal || onceki?.iptal,
        mesaj: err.govde?.whatsapp?.mesaj || err.message,
      }));
    } finally {
      setWaIslemde(false);
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
  const anlasmali = kart.sure?.tur === "ANLAŞMALI";
  const yeniMusteri = kart.sure?.tur === "YENİ MÜŞTERİ";
  const turSinif = anlasmali
    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
    : yeniMusteri ? "border-blue-300 bg-blue-50 text-blue-900" : "border-amber-300 bg-amber-50 text-amber-900";

  return (
    <div className="flex h-full flex-col bg-[#fbfcfd]">
      <div className="border-b bg-white px-4 py-3">
        <div className="truncate text-[16px] font-semibold">{kart.AD}</div>
        <div className="font-mono text-[11px] text-gray-500">{kart.FIRMAKODU}</div>
        <div className={`mt-3 rounded-lg border-2 px-3 py-2.5 ${turSinif}`}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em]">Müşteri durumu</div>
          <div className="mt-0.5 text-[20px] font-bold">
            {anlasmali ? "ANLAŞMALI MÜŞTERİ" : yeniMusteri ? "YENİ MÜŞTERİ" : "TÜR TANIMLANMAMIŞ"}
          </div>
          <div className="text-[11px] opacity-80">
            Vega özel kod 1: {kart.KOD1 || "boş"} · {anlasmali ? "Süre otomatik 1 yıl" : yeniMusteri ? "Süre elle tanımlanabilir" : "Özel kod 1'e ANLAŞMALI veya YENİ MÜŞTERİ yazılmalı"}
          </div>
        </div>
        <div className={`mt-3 rounded border px-3 py-2 ${bakiyeSinif}`}>
          <div className="text-[11px] uppercase tracking-wide">Cari borç durumu</div>
          <div className="text-[20px] font-semibold tabular-nums">{tl(ozet.bakiye)} ₺</div>
          <div className="text-[11px] text-gray-500">Borç {tl(ozet.borc)} ₺ · Alacak {tl(ozet.alacak)} ₺</div>
        </div>
      </div>

      {kart.sure?.sureTanimlanabilir ? (
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
      ) : (
        <div className="border-b bg-white px-4 py-3 text-[12px]">
          {anlasmali
            ? <>Anlaşmalı müşteri süresi otomatik <strong>12 ay</strong> olarak uygulanır. Bitiş: {kart.sure?.bitis || "başlangıç tarihi yok"}</>
            : "Süre tanımlamak için Vega özel kodunda müşteri türü YENİ MÜŞTERİ olmalıdır."}
        </div>
      )}

      <form onSubmit={islemEkle} className="border-b bg-blue-50 px-4 py-3">
        <div className="mb-2 text-[13px] font-semibold">İşlem kaydı</div>
        <textarea required maxLength={200} rows={3} value={form.baslik}
          onChange={(e) => setForm({ ...form, baslik: e.target.value })}
          placeholder="Yapılan işlem"
          className="w-full resize-none rounded border border-[#c7ccd4] bg-white px-3 py-2 outline-none focus:border-blue-500" />
        <div className="mt-2 flex items-center">
          <label className="text-[12px] font-semibold text-gray-700">WhatsApp mesaj şablonu</label>
          <button type="button" onClick={() => setForm({ ...form, whatsappSablonu: waSablon })}
            className="ml-auto text-[11px] text-blue-700 hover:underline">Ayarlardaki şablonu yükle</button>
        </div>
        <textarea required maxLength={1000} rows={3} value={form.whatsappSablonu}
          onChange={(e) => setForm({ ...form, whatsappSablonu: e.target.value })}
          placeholder="Ayarlar'daki değişkenli şablon"
          className="mt-1 w-full resize-none rounded border border-[#c7ccd4] bg-white px-3 py-2 outline-none focus:border-blue-500" />
        <div className="mt-1 flex text-[10px] text-gray-500">
          <span>Durum: Kaydet dediğiniz anda WhatsApp kuyruğuna alınır; patron onayı beklenmez.</span>
          <span className="ml-auto">{form.whatsappSablonu.length}/1000</span>
        </div>
        <div className="mt-1 rounded border border-blue-100 bg-white px-2 py-1.5 text-[11px] text-gray-700">
          <span className="font-semibold text-blue-800">Gönderilecek mesaj: </span>
          {mesajOnizle(form.whatsappSablonu, {
            musteri: veri.kart.AD, cariKodu: veri.kart.FIRMAKODU, islem: form.baslik,
            ucret: form.ucret, kullanici: kullaniciAl(),
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <input inputMode="decimal" value={form.ucret}
            onChange={(e) => setForm({ ...form, ucret: e.target.value })}
            placeholder="Söylenen ücret ₺"
            className="min-w-0 flex-1 rounded border border-[#c7ccd4] bg-white px-3 py-2 text-right outline-none focus:border-blue-500" />
          <button disabled={kaydediliyor || !form.baslik.trim() || !form.whatsappSablonu.trim()} className="rounded bg-blue-600 px-5 py-2 font-semibold text-white disabled:opacity-40">
            {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
        {hata && <div className="mt-2 text-[12px] text-red-700">{hata}</div>}
        {waBildirim && (
          <div className={`mt-2 rounded px-2 py-1.5 text-[11px] ${waBildirim.gonderildi ? "bg-emerald-50 text-emerald-800" : waBildirim.sirada ? "bg-blue-50 text-blue-800" : "bg-red-50 text-red-800"}`}>
            <div className="flex items-center gap-2">
              <span>{waBildirim.mesaj}</span>
            {!waBildirim.gonderildi && !waBildirim.iptal && !waBildirim.sirada && <button type="button" onClick={whatsappTekrarGonder} disabled={waIslemde}
              className="ml-auto shrink-0 rounded border border-current px-2 py-0.5 disabled:opacity-40">Tekrar gönder</button>}
            </div>
            {waBildirim.metin && <div className="mt-1 border-t border-current/15 pt-1 opacity-80">Mesaj: {waBildirim.metin}</div>}
          </div>
        )}
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
