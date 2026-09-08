import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

const tarihSaat = (d) => d ? new Date(d).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—";
const tl = (n) => Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const waDurumu = (kayit) => {
  if (kayit.WHATSAPPDURUMU === "GONDERILDI") return { metin: "Gönderildi", sinif: "bg-emerald-100 text-emerald-800" };
  if (["BEKLIYOR", "GONDERILIYOR"].includes(kayit.WHATSAPPDURUMU)) return { metin: "Gönderiliyor", sinif: "bg-blue-100 text-blue-800" };
  if (kayit.WHATSAPPDURUMU === "IPTAL") return { metin: "Süresi doldu", sinif: "bg-gray-200 text-gray-700" };
  return { metin: kayit.WHATSAPPDURUMU === "HATA" ? "Gönderilemedi" : "Kuyruk kaydı yok", sinif: "bg-red-100 text-red-800" };
};

export default function OnayBekleyenler({ firmaNo, tetik, onOnaylandi }) {
  const [kayitlar, setKayitlar] = useState([]);
  const [onaylanan, setOnaylanan] = useState(null);
  const [uyari, setUyari] = useState(null);

  const yukle = useCallback(async () => {
    const r = await api.ticketListe({ firma: firmaNo, durum: "ONAY_BEKLIYOR" });
    setKayitlar(r.kayitlar);
  }, [firmaNo]);

  useEffect(() => { yukle().catch((e) => setUyari(e.message)); }, [yukle, tetik]);
  useEffect(() => {
    const timer = setInterval(() => yukle().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [yukle]);

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b bg-white px-4 py-2">
        <span className="font-semibold">Onay bekleyenler</span>
        <span className="ml-2 text-[12px] text-gray-500">{kayitlar.length} kayıt</span>
        <span className="ml-auto rounded bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-800">
          Tamamlamak için satıra çift tıklayın
        </span>
      </div>
      {uyari && <div className="flex border-b border-red-200 bg-red-50 px-3 py-1.5 text-red-700"><span className="flex-1">{uyari}</span><button onClick={() => setUyari(null)}>×</button></div>}
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        <table className="izgara">
          <thead><tr>
            <th style={{ width: 135 }}>Kayıt zamanı</th>
            <th style={{ width: 260 }}>Müşteri</th>
            <th style={{ width: 390 }}>Yapılan işlem</th>
            <th style={{ width: 130 }}>Söylenen ücret</th>
            <th style={{ width: 135 }}>WhatsApp durumu</th>
            <th>Gönderilen mesaj</th>
          </tr></thead>
          <tbody>
            {kayitlar.map((k) => {
              const wa = waDurumu(k);
              return <tr key={k.ID} onDoubleClick={() => onayla(k)}
                className={onaylanan === k.ID ? "opacity-50" : "cursor-pointer"}
                title="Tamamlanan işlemlere taşımak için çift tıklayın">
                <td>{tarihSaat(k.ACILISTARIHI)}</td>
                <td title={k.CARIADI}>{k.CARIADI}</td>
                <td title={k.BASLIK}>{k.BASLIK}</td>
                <td className="sayi">{tl(k.UCRET)} ₺</td>
                <td title={k.WHATSAPPHATA || ""}><span className={`rozet ${wa.sinif}`}>{wa.metin}</span></td>
                <td title={k.WHATSAPPMETNI}>{k.WHATSAPPMETNI}</td>
              </tr>;
            })}
            {!kayitlar.length && <tr><td colSpan={6} className="py-8 text-center text-gray-500">Onay bekleyen işlem yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
