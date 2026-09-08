import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { MESAJ_DEGISKENLERI, VARSAYILAN_MESAJ_SABLONU } from "../lib/whatsappSablon";

export default function WhatsAppAyarlari() {
  const [durum, setDurum] = useState(null);
  const [mesgul, setMesgul] = useState(false);
  const [sablon, setSablon] = useState(VARSAYILAN_MESAJ_SABLONU);
  const [degiskenler, setDegiskenler] = useState(MESAJ_DEGISKENLERI);
  const [sablonMesaji, setSablonMesaji] = useState(null);
  const [sablonKaydediliyor, setSablonKaydediliyor] = useState(false);
  const sablonAlani = useRef(null);

  async function durumYukle() {
    try {
      setDurum(await api.whatsappDurum());
    } catch (err) {
      setDurum({ hazir: false, hata: err.message });
    }
  }

  useEffect(() => {
    durumYukle();
    api.whatsappSablon().then((r) => {
      setSablon(r.sablon);
      setDegiskenler(r.degiskenler || MESAJ_DEGISKENLERI);
    }).catch((err) => setSablonMesaji({ hata: true, metin: err.message }));
    const timer = setInterval(durumYukle, 4000);
    return () => clearInterval(timer);
  }, []);

  async function sifirla() {
    setMesgul(true);
    try {
      await api.whatsappSifirla();
      await durumYukle();
    } catch (err) {
      setDurum({ hazir: false, hata: err.message });
    } finally {
      setMesgul(false);
    }
  }

  async function anaYap() {
    setMesgul(true);
    try {
      const r = await api.whatsappAnaYap();
      setDurum(r.durum);
      await durumYukle();
    } catch (err) {
      setDurum((onceki) => ({ ...onceki, hata: err.message }));
    } finally {
      setMesgul(false);
    }
  }

  function degiskenEkle(degisken) {
    const alan = sablonAlani.current;
    const bas = alan?.selectionStart ?? sablon.length;
    const son = alan?.selectionEnd ?? bas;
    setSablon(sablon.slice(0, bas) + degisken + sablon.slice(son));
    requestAnimationFrame(() => {
      alan?.focus();
      alan?.setSelectionRange(bas + degisken.length, bas + degisken.length);
    });
  }

  async function mesajSablonuKaydet() {
    setSablonKaydediliyor(true);
    setSablonMesaji(null);
    try {
      const r = await api.whatsappSablonKaydet(sablon);
      setSablon(r.sablon);
      setSablonMesaji({ hata: false, metin: "Mesaj şablonu tüm bilgisayarlar için kaydedildi." });
    } catch (err) {
      setSablonMesaji({ hata: true, metin: err.message });
    } finally {
      setSablonKaydediliyor(false);
    }
  }

  return (
    <>
    <fieldset className="mb-5 rounded border border-[#dfe3e8] bg-white p-4">
      <legend className="px-1 text-[12px] font-semibold text-gray-600">WhatsApp bağlantısı</legend>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${durum?.hazir ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {durum?.hazir ? "BAĞLI" : durum?.baslatiliyor ? "BAĞLANIYOR" : "BAĞLI DEĞİL"}
        </span>
        {durum?.hesap && <span className="font-mono text-[11px] text-gray-600">+{durum.hesap}</span>}
        {durum?.buMakineAna ? (
          <button type="button" onClick={sifirla} disabled={mesgul}
            className="ml-auto rounded border border-[#c7ccd4] px-3 py-1.5 text-[11px] disabled:opacity-40">
            {mesgul ? "Sıfırlanıyor…" : "Oturumu sıfırla"}
          </button>
        ) : (
          <button type="button" onClick={anaYap} disabled={mesgul}
            className="ml-auto rounded bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">
            {mesgul ? "Kaydediliyor…" : "Bu bilgisayarı ana WhatsApp bilgisayarı yap"}
          </button>
        )}
      </div>

      <p className="mt-2 text-[11px] text-gray-500">
        Bu bilgisayar: <strong>{durum?.buMakine || "—"}</strong> · Ana bilgisayar: <strong>{durum?.anaMakine || "henüz seçilmedi"}</strong>
      </p>
      <p className="mt-1 text-[11px] text-gray-500">
        QR yalnız ana bilgisayarda okutulur. Diğer bilgisayarların mesajları ortak veritabanı kuyruğu üzerinden otomatik olarak ana bilgisayara ulaşır.
      </p>

      {durum?.buMakineAna && durum?.qrGorsel && (
        <div className="mt-3 flex items-center gap-4 rounded border bg-gray-50 p-3">
          <img src={durum.qrGorsel} alt="WhatsApp bağlantı QR kodu" className="h-40 w-40" />
          <div className="text-[12px] text-gray-700">
            <div className="font-semibold">QR kodunu bu bilgisayar için bir kez okutun</div>
            <div className="mt-1">WhatsApp → Bağlı cihazlar → Cihaz bağla</div>
          </div>
        </div>
      )}

      {durum?.hata && <div className="mt-2 rounded bg-amber-50 px-3 py-2 text-[11px] text-amber-800">{durum.hata}</div>}
    </fieldset>
    <fieldset className="mb-5 rounded border border-[#dfe3e8] bg-white p-4">
      <legend className="px-1 text-[12px] font-semibold text-gray-600">WhatsApp mesaj şablonu</legend>
      <label className="text-[12px] text-gray-600">Ticket kaydedildiğinde müşteriye gönderilecek ortak metin</label>
      <textarea ref={sablonAlani} value={sablon} onChange={(e) => setSablon(e.target.value)}
        maxLength={1000} rows={5}
        className="mt-1 w-full resize-y rounded border border-[#c7ccd4] px-3 py-2 outline-none focus:border-blue-500" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {degiskenler.map((degisken) => <button key={degisken} type="button" onClick={() => degiskenEkle(degisken)}
          className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-[11px] text-blue-800 hover:bg-blue-100">
          {degisken}
        </button>)}
      </div>
      <div className="mt-2 text-[11px] leading-5 text-gray-500">
        <strong>{"{firma}"}</strong>, <strong>{"{ad}"}</strong>, <strong>{"{unvan}"}</strong>: müşteri adı · <strong>{"{kod}"}</strong>: cari kodu ·<br />
        <strong>{"{islem}"}</strong>: yapılan işlem · <strong>{"{ucret}"}</strong>: ücret · <strong>{"{tarih}"}</strong>: kayıt tarihi · <strong>{"{kullanici}"}</strong>: kaydeden kişi
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={() => setSablon(VARSAYILAN_MESAJ_SABLONU)}
          className="rounded border border-[#c7ccd4] px-3 py-1.5 text-[11px]">Varsayılana dön</button>
        <span className="text-[10px] text-gray-400">{sablon.length}/1000</span>
        <button type="button" onClick={mesajSablonuKaydet} disabled={sablonKaydediliyor || !sablon.trim()}
          className="ml-auto rounded bg-blue-600 px-4 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">
          {sablonKaydediliyor ? "Kaydediliyor…" : "Şablonu kaydet"}
        </button>
      </div>
      {sablonMesaji && <div className={`mt-2 rounded px-3 py-2 text-[11px] ${sablonMesaji.hata ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{sablonMesaji.metin}</div>}
    </fieldset>
    </>
  );
}
