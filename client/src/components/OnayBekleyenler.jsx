import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { siralaFiltrele, tarihDegeri, useTablo } from "../lib/tablo";
import TabloBaslik from "./TabloBaslik";
import Modal from "./Modal";

const tarihSaat = (d) => d ? new Date(d).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—";
const tl = (n) => Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const WA_DURUMLARI = {
  GONDERILDI: { metin: "Gönderildi", sinif: "bg-emerald-100 text-emerald-800" },
  SIRADA: { metin: "Gönderiliyor", sinif: "bg-blue-100 text-blue-800" },
  IPTAL: { metin: "Süresi doldu", sinif: "bg-gray-200 text-gray-700" },
  HATA: { metin: "Gönderilemedi", sinif: "bg-red-100 text-red-800" },
  YOK: { metin: "Kuyruk kaydı yok", sinif: "bg-red-100 text-red-800" },
};
const waKodu = (k) => {
  if (["BEKLIYOR", "GONDERILIYOR"].includes(k.WHATSAPPDURUMU)) return "SIRADA";
  return WA_DURUMLARI[k.WHATSAPPDURUMU] ? k.WHATSAPPDURUMU : "YOK";
};

const SUTUNLAR = [
  { anahtar: "ACILISTARIHI", baslik: "Kayıt zamanı", genislik: 135, deger: (k) => tarihDegeri(k.ACILISTARIHI), metin: (k) => tarihSaat(k.ACILISTARIHI) },
  { anahtar: "CARIADI", baslik: "Müşteri", genislik: 240 },
  { anahtar: "BASLIK", baslik: "Yapılan işlem", genislik: 330 },
  { anahtar: "UCRET", baslik: "Söylenen ücret", genislik: 120, deger: (k) => Number(k.UCRET || 0), metin: (k) => tl(k.UCRET) },
  { anahtar: "OLUSTURAN", baslik: "Kaydeden", genislik: 100 },
  { anahtar: "WHATSAPP", baslik: "WhatsApp durumu", genislik: 150, tip: "secim", deger: waKodu,
    secenekler: Object.entries(WA_DURUMLARI).map(([deger, d]) => ({ deger, ad: d.metin })) },
  { anahtar: "WHATSAPPMETNI", baslik: "Gönderilen mesaj (düzenlenebilir)" },
];

export default function OnayBekleyenler({ firmaNo, tetik, onOnaylandi }) {
  const [kayitlar, setKayitlar] = useState([]);
  const [onaylanan, setOnaylanan] = useState(null);
  const [uyari, setUyari] = useState(null);
  const [bilgi, setBilgi] = useState(null);
  const [duzenlenen, setDuzenlenen] = useState(null);
  const tablo = useTablo({ sirala: "ACILISTARIHI", yon: "desc" });

  const yukle = useCallback(async () => {
    const r = await api.ticketListe({ firma: firmaNo, durum: "ONAY_BEKLIYOR" });
    setKayitlar(r.kayitlar);
  }, [firmaNo]);

  useEffect(() => { yukle().catch((e) => setUyari(e.message)); }, [yukle, tetik]);
  useEffect(() => {
    const timer = setInterval(() => yukle().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [yukle]);

  const gorunen = useMemo(() => siralaFiltrele(kayitlar, SUTUNLAR, tablo), [kayitlar, tablo.sirala, tablo.yon, tablo.filtreler]);

  async function onayla(kayit) {
    if (onaylanan) return;
    setOnaylanan(kayit.ID);
    setUyari(null);
    try {
      await api.ticketOnayla(kayit.ID);
      setKayitlar((rows) => rows.filter((x) => x.ID !== kayit.ID));
      onOnaylandi?.();
    } catch (err) {
      setUyari(err.message);
      await yukle().catch(() => {});
    } finally {
      setOnaylanan(null);
    }
  }

  async function tekrarGonder(kayit) {
    setUyari(null);
    try {
      const r = await api.whatsappGonder({ firma: firmaNo, donem: kayit.DONEMNO, ticketId: kayit.ID });
      setBilgi(r.whatsapp?.mesaj || "Mesaj yeniden kuyruğa alındı.");
    } catch (err) {
      setUyari(err.govde?.whatsapp?.mesaj || err.message);
    }
    await yukle().catch(() => {});
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b bg-white px-4 py-2">
        <span className="font-semibold">Onay bekleyenler</span>
        <span className="text-[12px] text-gray-500">
          {gorunen.length === kayitlar.length ? `${kayitlar.length} kayıt` : `${gorunen.length} / ${kayitlar.length} kayıt`}
        </span>
        {tablo.filtreVar && <button onClick={tablo.filtreleriTemizle} className="text-[12px] text-blue-700 hover:underline">Filtreleri temizle</button>}
        <span className="ml-auto rounded bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-800">
          Tamamlamak için satıra çift tıklayın · mesajı ✎ ile düzenleyin
        </span>
      </div>
      {uyari && <div className="flex border-b border-red-200 bg-red-50 px-3 py-1.5 text-red-700"><span className="flex-1">{uyari}</span><button onClick={() => setUyari(null)}>×</button></div>}
      {bilgi && <div className="flex border-b border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800"><span className="flex-1">{bilgi}</span><button onClick={() => setBilgi(null)}>×</button></div>}
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        <table className="izgara">
          <colgroup>{SUTUNLAR.map((s) => <col key={s.anahtar} style={{ width: s.genislik }} />)}</colgroup>
          <TabloBaslik sutunlar={SUTUNLAR} tablo={tablo} />
          <tbody>
            {gorunen.map((k) => {
              const kod = waKodu(k);
              const wa = WA_DURUMLARI[kod];
              const durdur = (e) => e.stopPropagation();
              return <tr key={k.ID} onDoubleClick={() => onayla(k)}
                className={onaylanan === k.ID ? "opacity-50" : "cursor-pointer"}
                title="Tamamlanan işlemlere taşımak için çift tıklayın">
                <td>{tarihSaat(k.ACILISTARIHI)}</td>
                <td title={k.CARIADI}>{k.CARIADI}</td>
                <td title={k.BASLIK}>{k.BASLIK}</td>
                <td className="sayi">{tl(k.UCRET)} ₺</td>
                <td>{k.OLUSTURAN}</td>
                <td title={k.WHATSAPPHATA || ""}>
                  <span className={`rozet ${wa.sinif}`}>{wa.metin}</span>
                  {(kod === "HATA" || kod === "YOK") && (
                    <button type="button" onClick={(e) => { durdur(e); tekrarGonder(k); }} onDoubleClick={durdur}
                      className="ml-1 text-[11px] text-blue-700 hover:underline">tekrar gönder</button>
                  )}
                </td>
                <td title={k.WHATSAPPMETNI}>
                  <button type="button" title="Mesajı düzenle" onClick={(e) => { durdur(e); setDuzenlenen(k); }} onDoubleClick={durdur}
                    className="mr-1.5 rounded border border-[#c7ccd4] px-1.5 text-[11px] text-gray-600 hover:border-blue-500 hover:text-blue-700">✎</button>
                  {k.WHATSAPPMETNI}
                </td>
              </tr>;
            })}
            {!gorunen.length && <tr><td colSpan={SUTUNLAR.length} className="py-8 text-center text-gray-500">
              {kayitlar.length ? "Filtreye uyan kayıt yok." : "Onay bekleyen işlem yok."}
            </td></tr>}
          </tbody>
        </table>
      </div>

      {duzenlenen && (
        <MesajDuzenle kayit={duzenlenen} firmaNo={firmaNo}
          onKapat={() => setDuzenlenen(null)}
          onKaydedildi={async (mesaj) => {
            setDuzenlenen(null);
            setBilgi(mesaj);
            await yukle().catch(() => {});
          }} />
      )}
    </div>
  );
}

function MesajDuzenle({ kayit, firmaNo, onKapat, onKaydedildi }) {
  const [metin, setMetin] = useState(kayit.WHATSAPPMETNI || "");
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState(null);
  const kod = waKodu(kayit);
  const gonderildi = kod === "GONDERILDI" || kod === "SIRADA";
  const tekrarGonderilebilir = kod === "HATA" || kod === "YOK";

  async function kaydet(gonder) {
    setMesgul(true);
    setHata(null);
    try {
      const r = await api.ticketWhatsappGuncelle(kayit.ID, metin);
      let mesaj = r.mesaj;
      if (gonder) {
        const g = await api.whatsappGonder({ firma: firmaNo, donem: kayit.DONEMNO, ticketId: kayit.ID });
        mesaj = g.whatsapp?.mesaj || mesaj;
      }
      onKaydedildi(mesaj);
    } catch (err) {
      setHata(err.govde?.whatsapp?.mesaj || err.message);
    } finally {
      setMesgul(false);
    }
  }

  return (
    <Modal baslik="WhatsApp mesajını düzenle" onKapat={onKapat} genislik={600}>
      <div className="rounded border bg-white p-3">
        <div className="text-[13px] font-semibold">{kayit.CARIADI}</div>
        <div className="text-[12px] text-gray-600">{kayit.BASLIK}</div>
        <textarea value={metin} onChange={(e) => setMetin(e.target.value)} maxLength={1000} rows={6} autoFocus
          className="mt-2 w-full resize-y rounded border border-[#c7ccd4] px-3 py-2 outline-none focus:border-blue-500" />
        <div className="mt-1 flex text-[11px] text-gray-500">
          <span>{gonderildi
            ? "Bu mesaj gönderildi veya gönderiliyor; değişiklik yalnız kayda işlenir."
            : "Mesaj henüz gönderilmedi; kuyruktaki metin de güncellenir."}</span>
          <span className="ml-auto">{metin.length}/1000</span>
        </div>
        {hata && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-[12px] text-red-800">{hata}</div>}
        <div className="mt-3 flex gap-2">
          <button onClick={() => kaydet(false)} disabled={mesgul || !metin.trim()}
            className="rounded bg-blue-600 px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
            {mesgul ? "Kaydediliyor…" : "Kaydet"}
          </button>
          {tekrarGonderilebilir && (
            <button onClick={() => kaydet(true)} disabled={mesgul || !metin.trim()}
              className="rounded bg-emerald-600 px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
              Kaydet ve tekrar gönder
            </button>
          )}
          <button onClick={onKapat} disabled={mesgul} className="ml-auto rounded border border-[#c7ccd4] px-4 py-1.5 text-[12px]">Vazgeç</button>
        </div>
      </div>
    </Modal>
  );
}
