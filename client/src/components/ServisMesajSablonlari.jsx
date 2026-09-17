import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { SERVIS_MESAJ_TURLERI, sablonOnizle } from "../lib/servisMesaj";

const tarihSaat = (d) => (d ? new Date(d).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "");

/**
 * Servis mesaj türlerinin ortak şablonları. Her tür ayrı kaydedilir; iki kişi
 * farklı türleri aynı anda düzenlerse birbirinin değişikliğini ezmez.
 */
export default function ServisMesajSablonlari() {
  const [veri, setVeri] = useState(null);
  const [tur, setTur] = useState("KABUL");
  const [taslak, setTaslak] = useState({});
  const [mesaj, setMesaj] = useState(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const alan = useRef(null);

  useEffect(() => {
    api.servisWhatsappSablonlar()
      .then(setVeri)
      .catch((err) => setMesaj({ hata: true, metin: err.message }));
  }, []);

  if (!veri) return <div className="text-[12px] text-gray-500">{mesaj?.metin || "Yükleniyor…"}</div>;

  const kayitli = veri.sablonlar[tur] || "";
  const metin = taslak[tur] ?? kayitli;
  const degisti = (kod) => taslak[kod] !== undefined && taslak[kod] !== veri.sablonlar[kod];
  const yaz = (yeni) => setTaslak((t) => ({ ...t, [tur]: yeni }));

  function degiskenEkle(degisken) {
    const el = alan.current;
    const bas = el?.selectionStart ?? metin.length;
    const son = el?.selectionEnd ?? bas;
    yaz(metin.slice(0, bas) + degisken + metin.slice(son));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(bas + degisken.length, bas + degisken.length);
    });
  }

  async function kaydet() {
    setKaydediliyor(true);
    setMesaj(null);
    try {
      const r = await api.servisWhatsappSablonKaydet(tur, metin);
      setVeri((v) => ({ ...v, sablonlar: { ...v.sablonlar, [tur]: r.sablon }, bilgi: { ...v.bilgi, [tur]: r.bilgi } }));
      setTaslak((t) => { const kalan = { ...t }; delete kalan[tur]; return kalan; });
      setMesaj({ hata: false, metin: "Şablon tüm bilgisayarlar için kaydedildi." });
    } catch (err) {
      setMesaj({ hata: true, metin: err.message });
    } finally {
      setKaydediliyor(false);
    }
  }

  const bilgi = veri.bilgi?.[tur];
  return (
    <div className="text-[12px]">
      <div className="flex flex-wrap gap-1.5">
        {SERVIS_MESAJ_TURLERI.map((t) => (
          <button key={t.kod} type="button" onClick={() => { setTur(t.kod); setMesaj(null); }}
            className={`rounded-full px-3 py-1 text-[11px] ${tur === t.kod ? "bg-slate-700 font-semibold text-white" : "border border-[#c7ccd4] bg-white"}`}>
            {t.ad}{degisti(t.kod) ? " •" : ""}
          </button>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-gray-500">
        Servis kaydında “WhatsApp mesajı gönder” denince bu metin kayıt bilgileriyle doldurulur; gönderen kişi göndermeden önce değiştirebilir.
        {bilgi?.guncelleyen
          ? <> Son düzenleyen: <strong>{bilgi.guncelleyen}</strong> ({tarihSaat(bilgi.tarih)})</>
          : " Bu tür için varsayılan metin kullanılıyor."}
      </div>
      <textarea ref={alan} value={metin} onChange={(e) => yaz(e.target.value)} maxLength={1000} rows={4}
        className="mt-1 w-full resize-y rounded border border-[#c7ccd4] px-3 py-2 outline-none focus:border-blue-500" />
      <div className="mt-1 flex flex-wrap gap-1.5">
        {veri.degiskenler.map((d) => (
          <button key={d} type="button" onClick={() => degiskenEkle(d)}
            className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-[11px] text-blue-800 hover:bg-blue-100">{d}</button>
        ))}
      </div>
      <div className="mt-2 text-[11px] leading-5 text-gray-500">
        <strong>{"{firma}"}</strong>: müşteri adı · <strong>{"{servisno}"}</strong>: SRV numarası · <strong>{"{cihaz}"}</strong>: marka model ·{" "}
        <strong>{"{serino}"}</strong> · <strong>{"{yetkili}"}</strong>: getiren kişi · <strong>{"{kargo}"}</strong> / <strong>{"{takipno}"}</strong>: son gönderimden ·{" "}
        <strong>{"{kabultarihi}"}</strong> · <strong>{"{tarih}"}</strong>: gönderim günü · <strong>{"{kullanici}"}</strong>: gönderen kişi
      </div>
      <div className="mt-2 rounded border border-emerald-100 bg-emerald-50/60 px-2 py-1.5 text-[11px] text-gray-700">
        <span className="font-semibold text-emerald-800">Örnek: </span>{sablonOnizle(metin)}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => yaz(veri.varsayilanlar[tur])}
          className="rounded border border-[#c7ccd4] px-3 py-1.5 text-[11px]">Varsayılana dön</button>
        {degisti(tur) && (
          <button type="button" onClick={() => yaz(kayitli)} className="text-[11px] text-blue-700 hover:underline">Değişikliği geri al</button>
        )}
        <span className="text-[10px] text-gray-400">{metin.length}/1000</span>
        <button type="button" onClick={kaydet} disabled={kaydediliyor || !metin.trim() || !degisti(tur)}
          className="ml-auto rounded bg-blue-600 px-4 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">
          {kaydediliyor ? "Kaydediliyor…" : "Şablonu kaydet"}
        </button>
      </div>
      {mesaj && <div className={`mt-2 rounded px-3 py-2 text-[11px] ${mesaj.hata ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{mesaj.metin}</div>}
    </div>
  );
}
