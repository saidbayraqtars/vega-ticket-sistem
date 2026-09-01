import { useCallback, useEffect, useState } from "react";
import { api, kullaniciAyarla } from "./api/client";
import Kurulum from "./pages/Kurulum";
import Panel from "./pages/Panel";

export default function App() {
  const [durum, setDurum] = useState(null);
  const [hata, setHata] = useState(null);
  const [kurulumZorla, setKurulumZorla] = useState(false);

  const durumYukle = useCallback(async () => {
    try {
      const r = await api.kurulumDurum();
      setDurum(r);
      if (r.config?.kullanici) kullaniciAyarla(r.config.kullanici);
      setHata(null);
    } catch (e) {
      setHata(e.message);
    }
  }, []);

  useEffect(() => {
    durumYukle();
  }, [durumYukle]);

  if (hata) {
    return (
      <div className="p-6 text-[13px]">
        <div className="mb-2 font-semibold text-red-800">Sunucuya ulaşılamadı</div>
        <div className="text-gray-600">{hata}</div>
        <button onClick={durumYukle} className="mt-3 rounded border border-[#c7ccd4] px-3 py-1">
          Tekrar dene
        </button>
      </div>
    );
  }

  if (!durum) return <div className="p-6 text-[13px] text-gray-500">Yükleniyor…</div>;

  const hazir =
    durum.bagli && durum.config?.firmaNo && durum.config?.donemNo && durum.config?.kullanici;

  if (!hazir || kurulumZorla) {
    return (
      <Kurulum
        durum={durum}
        onBitti={async (sonuc) => {
          await durumYukle();
          if (sonuc?.tamam) setKurulumZorla(false);
        }}
      />
    );
  }

  return (
    <Panel
      firmaNo={durum.config.firmaNo}
      donemNo={durum.config.donemNo}
      onAyarlar={() => setKurulumZorla(true)}
    />
  );
}
