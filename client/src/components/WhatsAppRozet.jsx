import { useEffect, useState } from "react";
import { api } from "../api/client";
import Modal from "./Modal";
import WhatsAppAyarlari from "./WhatsAppAyarlari";

const YOKLAMA_MS = 10000;

/**
 * Her ekranın başlığında WhatsApp bağlantısı ve oturumun hangi kullanıcıda /
 * bilgisayarda açık olduğu. Tıklanınca bağlantı ve mesaj şablonu penceresi açılır;
 * şablonu herkes düzenleyebilir.
 */
export default function WhatsAppRozet() {
  const [durum, setDurum] = useState(null);
  const [acik, setAcik] = useState(false);

  useEffect(() => {
    let iptal = false;
    const yukle = () => api.whatsappDurum()
      .then((d) => !iptal && setDurum(d))
      .catch((err) => !iptal && setDurum({ hazir: false, hata: err.message }));
    yukle();
    const zamanlayici = setInterval(yukle, YOKLAMA_MS);
    return () => { iptal = true; clearInterval(zamanlayici); };
  }, []);

  const bagli = Boolean(durum?.hazir);
  const baglaniyor = !bagli && Boolean(durum?.baslatiliyor);
  const renk = !durum
    ? "border-gray-300 bg-gray-50 text-gray-600"
    : bagli ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : baglaniyor ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-300 bg-red-50 text-red-900";
  const nokta = !durum ? "bg-gray-400" : bagli ? "bg-emerald-500" : baglaniyor ? "bg-amber-500" : "bg-red-500";
  const yazi = !durum ? "WhatsApp…" : bagli ? "WhatsApp bağlı" : baglaniyor ? "WhatsApp bağlanıyor" : "WhatsApp bağlı değil";
  const kim = durum?.anaMakine
    ? `${durum.anaKullanici || "?"} · ${durum.anaMakine}`
    : durum ? "ana bilgisayar seçilmedi" : "";

  return (
    <>
      <button type="button" onClick={() => setAcik(true)}
        className={`flex max-w-[460px] items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] ${renk}`}
        title={[durum?.hata, "Bağlantı ve mesaj şablonları için tıklayın"].filter(Boolean).join(" — ")}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${nokta}`} />
        <span className="shrink-0 font-semibold">{yazi}</span>
        {kim && <span className="truncate opacity-80">· Açık: {kim}</span>}
        {durum?.hesap && <span className="shrink-0 font-mono opacity-70">+{durum.hesap}</span>}
      </button>
      {acik && (
        <Modal baslik="WhatsApp bağlantısı ve mesaj şablonları" onKapat={() => setAcik(false)} genislik={720}>
          <WhatsAppAyarlari />
        </Modal>
      )}
    </>
  );
}
