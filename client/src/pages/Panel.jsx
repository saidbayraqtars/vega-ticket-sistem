import { useCallback, useEffect, useState } from "react";
import { api, kullaniciAl } from "../api/client";
import Arama from "../components/Arama";
import CariIzgara from "../components/CariIzgara";
import CariDetay from "../components/CariDetay";
import TicketIzgara from "../components/TicketIzgara";
import OnayBekleyenler from "../components/OnayBekleyenler";
import ServisEkrani from "../components/ServisEkrani";

const SAYFA = 300;

export default function Panel({ firmaNo, donemNo, onAyarlar }) {
  const [gorunum, setGorunum] = useState("musteriler");
  const [kayitlar, setKayitlar] = useState([]);
  const [toplam, setToplam] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sirala, setSirala] = useState("ad");
  const [yon, setYon] = useState("asc");
  const [secili, setSecili] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [ticketTetik, setTicketTetik] = useState(0);

  const listeYukle = useCallback(async (yenile = false) => {
    setYukleniyor(true);
    setHata(null);
    try {
      const r = await api.cariListe({
        firma: firmaNo, donem: donemNo, sirala, yon, offset,
        limit: SAYFA, yenile: yenile ? "1" : "",
      });
      setKayitlar(r.kayitlar);
      setToplam(r.toplam);
    } catch (e) {
      setHata(e.message);
    } finally {
      setYukleniyor(false);
    }
  }, [firmaNo, donemNo, sirala, yon, offset]);

  useEffect(() => { listeYukle(); }, [listeYukle]);
  function siralamaDegistir(anahtar) {
    if (anahtar === sirala) setYon(yon === "asc" ? "desc" : "asc");
    else { setSirala(anahtar); setYon("asc"); }
    setOffset(0);
  }
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
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[12px] text-gray-600">{kullaniciAl() || "—"}</span>
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
          <div className="flex items-center border-b bg-white px-3 py-1.5">
            <span className="text-[12px] text-gray-500">{yukleniyor ? "yükleniyor…" : `${toplam.toLocaleString("tr-TR")} müşteri`}</span>
            <div className="ml-auto flex items-center gap-1 text-[12px]">
              <button className="rounded border px-2 py-0.5 disabled:opacity-40" disabled={offset === 0} onClick={() => setOffset(Math.max(offset - SAYFA, 0))}>‹</button>
              <span>{sayfa} / {sonSayfa}</span>
              <button className="rounded border px-2 py-0.5 disabled:opacity-40" disabled={offset + SAYFA >= toplam} onClick={() => setOffset(offset + SAYFA)}>›</button>
              <button className="ml-2 rounded border px-2 py-0.5" onClick={() => listeYukle(true)}>Tazele</button>
            </div>
          </div>
          {hata && <div className="bg-red-50 px-3 py-1.5 text-red-700">{hata}</div>}
          <div className="flex min-h-0 flex-1">
            <div className="min-w-0 flex-1 border-r bg-white">
              <CariIzgara kayitlar={kayitlar} seciliInd={secili?.IND} onSec={setSecili}
                sirala={sirala} yon={yon} onSirala={siralamaDegistir} />
            </div>
            <aside className="w-[570px] shrink-0">
              <CariDetay firmaNo={firmaNo} donemNo={donemNo} cariInd={secili?.IND}
                onTicketDegisti={() => setTicketTetik((x) => x + 1)}
                onMusteriDegisti={() => listeYukle()} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

const Sekme = ({ aktif, onClick, children }) => <button onClick={onClick}
  className={`rounded px-4 py-1.5 text-[12px] ${aktif ? "bg-blue-600 text-white" : "border bg-white"}`}>{children}</button>;
