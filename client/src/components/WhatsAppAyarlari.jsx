import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function WhatsAppAyarlari() {
  const [durum, setDurum] = useState(null);
  const [mesgul, setMesgul] = useState(false);

  async function durumYukle() {
    try {
      setDurum(await api.whatsappDurum());
    } catch (err) {
      setDurum({ hazir: false, hata: err.message });
    }
  }

  useEffect(() => {
    durumYukle();
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

  return (
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
  );
}
