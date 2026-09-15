import { useCallback, useEffect, useState } from "react";
import { api, kullaniciAyarla, oturumAyarla, GIRIS_GEREKLI_OLAYI } from "./api/client";
import Kurulum from "./pages/Kurulum";
import Panel from "./pages/Panel";
import Giris from "./pages/Giris";

export default function App() {
  const [durum, setDurum] = useState(null);
  const [hata, setHata] = useState(null);
  const [kurulumZorla, setKurulumZorla] = useState(false);
  const [oturumBilgi, setOturumBilgi] = useState(null);
  // Sunucu PIN isteyince açılan giriş vazgeçilemez; kullanıcı değiştirme vazgeçilebilir.
  const [girisZorunlu, setGirisZorunlu] = useState(false);
  const [kullaniciDegistir, setKullaniciDegistir] = useState(false);

  const oturumYukle = useCallback(async () => {
    try {
      const r = await api.oturumDurum();
      setOturumBilgi(r);
      return r;
    } catch {
      setOturumBilgi(null);
      return null;
    }
  }, []);

  const durumYukle = useCallback(async () => {
    try {
      const r = await api.kurulumDurum();
      setDurum(r);
      if (r.config?.kullanici) kullaniciAyarla(r.config.kullanici);
      setHata(null);
      if (r.bagli) await oturumYukle();
    } catch (e) {
      setHata(e.message);
    }
  }, [oturumYukle]);

  useEffect(() => {
    durumYukle();
  }, [durumYukle]);

  useEffect(() => {
    const ac = () => setGirisZorunlu(true);
    window.addEventListener(GIRIS_GEREKLI_OLAYI, ac);
    return () => window.removeEventListener(GIRIS_GEREKLI_OLAYI, ac);
  }, []);

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

  if (durum.bagli && (girisZorunlu || kullaniciDegistir || oturumBilgi?.girisGerekli)) {
    const vazgecilebilir = kullaniciDegistir && !girisZorunlu && !oturumBilgi?.girisGerekli;
    return (
      <Giris
        varsayilan={durum.config?.kullanici}
        onGiris={async () => {
          setGirisZorunlu(false);
          setKullaniciDegistir(false);
          await durumYukle();
        }}
        onVazgec={vazgecilebilir ? () => setKullaniciDegistir(false) : undefined}
      />
    );
  }

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
      oturumBilgi={oturumBilgi}
      onAyarlar={() => setKurulumZorla(true)}
      onKullaniciDegistir={() => setKullaniciDegistir(true)}
      onOturumDegisti={oturumYukle}
      onCikis={async () => {
        await api.cikis().catch(() => { /* oturum zaten düşmüş olabilir */ });
        oturumAyarla("");
        const r = await oturumYukle();
        if (!r?.girisGerekli) setKullaniciDegistir(true);
      }}
    />
  );
}
