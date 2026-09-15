import { useCallback, useEffect, useRef, useState } from "react";
import { api, kullaniciAl } from "../api/client";
import { useTablo } from "../lib/tablo";
import Arama from "../components/Arama";
import CariIzgara from "../components/CariIzgara";
import CariDetay from "../components/CariDetay";
import TicketIzgara from "../components/TicketIzgara";
import OnayBekleyenler from "../components/OnayBekleyenler";
import ServisEkrani from "../components/ServisEkrani";
import WhatsAppRozet from "../components/WhatsAppRozet";
import Modal from "../components/Modal";
import PinAyari from "../components/PinAyari";

const SAYFA = 300;
// Vega'da değişen tür/pasif bilgisi açık ekrana da yansısın. Sunucu kart
// imzasına 15 sn'de bir baktığı için bu aralık DB'yi yormaz.
const OTOMATIK_TAZELEME_MS = 60 * 1000;
const FILTRE_GECIKMESI_MS = 300;
const SUNUCU_FILTRELERI = ["kod", "ad", "tur", "borc", "sure"];

export default function Panel({ firmaNo, donemNo, oturumBilgi, onAyarlar, onKullaniciDegistir, onOturumDegisti, onCikis }) {
  const [gorunum, setGorunum] = useState("musteriler");
  const [kayitlar, setKayitlar] = useState([]);
  const [toplam, setToplam] = useState(0);
  const [genelToplam, setGenelToplam] = useState(0);
  const [ozet, setOzet] = useState(null);
  const [offset, setOffset] = useState(0);
  const [secili, setSecili] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [ticketTetik, setTicketTetik] = useState(0);
  const [detayTetik, setDetayTetik] = useState(0);
  const tablo = useTablo({ sirala: "ad", yon: "asc" });
  const [filtre, setFiltre] = useState({});
  const istekNo = useRef(0);

  // Yazarken her tuşta 40 bin satırı yeniden süzmemek için kısa gecikme.
  useEffect(() => {
    const zamanlayici = setTimeout(() => {
      setFiltre(Object.fromEntries(SUNUCU_FILTRELERI.map((k) => [k, tablo.filtreler[k] ?? ""])));
      setOffset(0);
    }, FILTRE_GECIKMESI_MS);
    return () => clearTimeout(zamanlayici);
  }, [tablo.filtreler]);

  useEffect(() => { setOffset(0); }, [tablo.sirala, tablo.yon]);

  const listeYukle = useCallback(async ({ yenile = false, sessiz = false } = {}) => {
    const no = ++istekNo.current;
    if (!sessiz) {
      setYukleniyor(true);
      setHata(null);
    }
    try {
      const r = await api.cariListe({
        firma: firmaNo, donem: donemNo, sirala: tablo.sirala || "ad", yon: tablo.yon, offset,
        limit: SAYFA, yenile: yenile ? "1" : "", ...filtre,
      });
      if (no !== istekNo.current) return;
      setKayitlar(r.kayitlar);
      setToplam(r.toplam);
      setGenelToplam(r.genelToplam ?? r.toplam);
      setOzet(r.ozet || null);
      setHata(null);
    } catch (e) {
      if (!sessiz && no === istekNo.current) setHata(e.message);
    } finally {
      if (!sessiz) setYukleniyor(false);
    }
  }, [firmaNo, donemNo, tablo.sirala, tablo.yon, offset, filtre]);

  useEffect(() => { listeYukle(); }, [listeYukle]);

  useEffect(() => {
    if (gorunum !== "musteriler") return undefined;
    const zamanlayici = setInterval(() => {
      if (document.hidden) return;
      listeYukle({ sessiz: true });
      setDetayTetik((x) => x + 1);
    }, OTOMATIK_TAZELEME_MS);
    return () => clearInterval(zamanlayici);
  }, [gorunum, listeYukle]);

  function aramadanSec(kayit) {
    setGorunum("musteriler");
    setSecili(kayit);
    setKayitlar((rows) => rows.some((x) => x.IND === kayit.IND) ? rows : [kayit, ...rows]);
  }

  const sonSayfa = Math.max(Math.ceil(toplam / SAYFA), 1);
  const sayfa = Math.floor(offset / SAYFA) + 1;
  return (
    <div className="flex h-full flex-col">
      <header className="border-b bg-white px-4 py-3">
        <div className="mb-3 flex items-center gap-3">
          <span className="text-[15px] font-semibold">Vega Müşteri İşlemleri</span>
          <span className="rounded bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-600">Firma {firmaNo} · Dönem {donemNo}</span>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <WhatsAppRozet />
            <KullaniciMenu oturumBilgi={oturumBilgi} onKullaniciDegistir={onKullaniciDegistir}
              onCikis={onCikis} onOturumDegisti={onOturumDegisti} />
            <button onClick={onAyarlar} className="rounded border border-[#c7ccd4] px-3 py-1.5 text-[12px]">Ayarlar</button>
          </div>
        </div>
        <Arama firmaNo={firmaNo} donemNo={donemNo} onSec={aramadanSec} />
        <div className="mt-3 flex gap-2">
          <Sekme aktif={gorunum === "musteriler"} onClick={() => setGorunum("musteriler")}>Müşteriler</Sekme>
          <Sekme aktif={gorunum === "onay"} onClick={() => setGorunum("onay")}>Onay bekleyenler</Sekme>
          <Sekme aktif={gorunum === "ticketlar"} onClick={() => setGorunum("ticketlar")}>Tamamlanan işlemler</Sekme>
          <Sekme aktif={gorunum === "servis"} onClick={() => setGorunum("servis")}>Servis kabul</Sekme>
        </div>
      </header>

      {gorunum === "ticketlar" ? (
        <div className="min-h-0 flex-1"><TicketIzgara firmaNo={firmaNo} tetik={ticketTetik} /></div>
      ) : gorunum === "onay" ? (
        <div className="min-h-0 flex-1"><OnayBekleyenler firmaNo={firmaNo} tetik={ticketTetik}
          onOnaylandi={() => setTicketTetik((x) => x + 1)} /></div>
      ) : gorunum === "servis" ? (
        <div className="min-h-0 flex-1"><ServisEkrani firmaNo={firmaNo} donemNo={donemNo} /></div>
      ) : (
        <>
          <div className="flex items-center gap-3 border-b bg-white px-3 py-1.5">
            <span className="text-[12px] text-gray-500">
              {yukleniyor
                ? "yükleniyor…"
                : toplam === genelToplam
                  ? `${toplam.toLocaleString("tr-TR")} aktif müşteri`
                  : `${toplam.toLocaleString("tr-TR")} / ${genelToplam.toLocaleString("tr-TR")} aktif müşteri`}
            </span>
            {tablo.filtreVar && (
              <button onClick={tablo.filtreleriTemizle} className="text-[12px] text-blue-700 hover:underline">Filtreleri temizle</button>
            )}
            <span className="text-[11px] text-gray-400">Başlığa tıklayıp sıralayın, alttaki kutularla filtreleyin. Pasif cariler listelenmez.</span>
            <div className="ml-auto flex items-center gap-1 text-[12px]">
              <button className="rounded border px-2 py-0.5 disabled:opacity-40" disabled={offset === 0} onClick={() => setOffset(Math.max(offset - SAYFA, 0))}>‹</button>
              <span>{sayfa} / {sonSayfa}</span>
              <button className="rounded border px-2 py-0.5 disabled:opacity-40" disabled={offset + SAYFA >= toplam} onClick={() => setOffset(offset + SAYFA)}>›</button>
              <button className="ml-2 rounded border px-2 py-0.5" title="Vega'dan yeniden okur"
                onClick={() => { listeYukle({ yenile: true }); setDetayTetik((x) => x + 1); }}>Tazele</button>
            </div>
          </div>
          {hata && <div className="bg-red-50 px-3 py-1.5 text-red-700">{hata}</div>}
          <div className="flex min-h-0 flex-1">
            <div className="min-w-0 flex-1 border-r bg-white">
              <CariIzgara kayitlar={kayitlar} seciliInd={secili?.IND} onSec={setSecili} tablo={tablo} ozet={ozet} />
            </div>
            <aside className="w-[570px] shrink-0">
              <CariDetay firmaNo={firmaNo} donemNo={donemNo} cariInd={secili?.IND} yenilemeTetik={detayTetik}
                onTicketDegisti={() => setTicketTetik((x) => x + 1)}
                onMusteriDegisti={() => listeYukle()} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function KullaniciMenu({ oturumBilgi, onKullaniciDegistir, onCikis, onOturumDegisti }) {
  const [acik, setAcik] = useState(false);
  const [pinAcik, setPinAcik] = useState(false);
  const pinVar = Boolean(oturumBilgi?.pinVar);
  const sec = (fn) => () => { setAcik(false); fn?.(); };

  return (
    <div className="relative">
      <button onClick={() => setAcik((a) => !a)}
        className="flex items-center gap-1 rounded border border-[#c7ccd4] px-3 py-1.5 text-[12px]"
        title={pinVar ? "PIN ile giriş yapıldı" : "PIN tanımlı değil"}>
        <span className="font-semibold">{kullaniciAl() || "—"}</span>
        {pinVar && <span>🔒</span>}
        <span className="text-gray-400">▾</span>
      </button>
      {acik && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setAcik(false)} />
          <div className="absolute right-0 z-30 mt-1 w-56 rounded border bg-white py-1 text-[12px] shadow-lg">
            <MenuSatiri onClick={sec(onKullaniciDegistir)}>Kullanıcı değiştir</MenuSatiri>
            <MenuSatiri onClick={sec(() => setPinAcik(true))}>{pinVar ? "PIN değiştir / kaldır" : "Giriş PIN'i belirle"}</MenuSatiri>
            {pinVar && <MenuSatiri onClick={sec(onCikis)}>Çıkış yap (kilitle)</MenuSatiri>}
          </div>
        </>
      )}
      {pinAcik && (
        <Modal baslik="Giriş PIN'i" onKapat={() => setPinAcik(false)} genislik={560}>
          <PinAyari pinVar={pinVar} onDegisti={() => onOturumDegisti?.()} />
        </Modal>
      )}
    </div>
  );
}

const MenuSatiri = ({ onClick, children }) => (
  <button onClick={onClick} className="block w-full px-3 py-1.5 text-left hover:bg-blue-50">{children}</button>
);

const Sekme = ({ aktif, onClick, children }) => <button onClick={onClick}
  className={`rounded px-4 py-1.5 text-[12px] ${aktif ? "bg-blue-600 text-white" : "border bg-white"}`}>{children}</button>;
