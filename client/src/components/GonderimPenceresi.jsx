import { useEffect, useState } from "react";
import { api } from "../api/client";
import { yazdir, adresEtiketiYazdir, barkodSayfasiHtml } from "../lib/yazdir";
import Modal from "./Modal";

const KARGO_FIRMALARI = ["Yurtiçi Kargo", "Aras Kargo", "MNG Kargo", "Sürat Kargo", "PTT Kargo", "HepsiJET", "Kolay Gelsin", "UPS", "DHL", "Elden teslim"];
const BOS_FORM = { ALICIADI: "", ALICIYETKILI: "", ALICITELEFON: "", ALICIADRES: "", ALICIIL: "", KARGOFIRMASI: "", TAKIPNO: "", NOTU: "" };
const ADRES_ALANLARI = ["ALICIADI", "ALICIYETKILI", "ALICITELEFON", "ALICIADRES", "ALICIIL", "KARGOFIRMASI"];
const BOS_GONDEREN = { ad: "", yetkili: "", adres: "", il: "", telefon: "", eposta: "" };
const adresSec = (a) => Object.fromEntries(ADRES_ALANLARI.map((k) => [k, a?.[k] ?? ""]));

/**
 * Arızaya gönderme / kargoya verme. Alıcı bilgisi girilir, kayıt durumu
 * değişir; A5 adres etiketi ve barkod çıktısı buradan alınır.
 *   ARIZA → alıcı üretici/yetkili servis; daha önce kullanılan adresler listelenir.
 *   KARGO → alıcı müşteri; adres Vega cari kartından önerilir.
 */
export default function GonderimPenceresi({ kayit, tur, firmaNo, onKapat, onKaydedildi }) {
  const ariza = tur === "ARIZA";
  const [form, setForm] = useState(BOS_FORM);
  const [rv, setRv] = useState(kayit.RV);
  const [adresler, setAdresler] = useState([]);
  const [gonderen, setGonderen] = useState(BOS_GONDEREN);
  const [gonderenAcik, setGonderenAcik] = useState(false);
  const [gonderenMesaj, setGonderenMesaj] = useState(null);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState(null);

  useEffect(() => {
    api.servisGonderen(firmaNo)
      .then((r) => {
        setGonderen({ ...BOS_GONDEREN, ...r.gonderen });
        // Hiç kaydedilmemişse (Vega'dan öneri) kontrol edilsin diye açık gelir.
        setGonderenAcik(r.kaynak !== "ayar");
      })
      .catch(() => setGonderenAcik(true));
    if (ariza) {
      api.servisGonderimAdresleri("ARIZA")
        .then((r) => {
          setAdresler(r.adresler);
          if (r.adresler[0]) setForm((f) => (f.ALICIADI ? f : { ...f, ...adresSec(r.adresler[0]) }));
        })
        .catch(() => { /* adres defteri isteğe bağlı */ });
    } else {
      api.servisMusteriAdres(kayit.ID)
        .then((r) => setForm((f) => ({ ...f, ...Object.fromEntries(Object.entries(r.adres).map(([k, v]) => [k, v ?? ""])) })))
        .catch((err) => setHata(`Müşteri adresi okunamadı: ${err.message}`));
    }
    // Pencere her açılışta bir kez doldurulur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alan = (k) => ({ value: form[k], onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })) });

  async function kaydet(yazdirIste) {
    if (!form.ALICIADI.trim()) {
      setHata("Alıcı adı zorunlu.");
      return;
    }
    setMesgul(true);
    setHata(null);
    try {
      const r = await api.servisGonderim(kayit.ID, { TUR: tur, RV: rv, ...form });
      if (yazdirIste) {
        const t = await api.servisAdresTasarim().catch(() => ({ tasarim: null }));
        await adresEtiketiYazdir({ kayit: r.kayit, gonderim: r.kayit.gonderimler[0], gonderen, tasarim: t.tasarim });
      }
      onKaydedildi(r.kayit, tur);
    } catch (err) {
      if (err.govde?.kayit?.RV) setRv(err.govde.kayit.RV);
      setHata(err.message);
    } finally {
      setMesgul(false);
    }
  }

  async function gonderenKaydet() {
    setGonderenMesaj(null);
    try {
      const r = await api.servisGonderenKaydet(gonderen);
      setGonderen(r.gonderen);
      setGonderenMesaj({ hata: false, metin: "Gönderen bilgisi tüm bilgisayarlar için kaydedildi." });
    } catch (err) {
      setGonderenMesaj({ hata: true, metin: err.message });
    }
  }

  const girdi = "w-full rounded border border-[#c7ccd4] bg-white px-2 py-1 outline-none focus:border-blue-500";
  return (
    <Modal baslik={`${kayit.SERVISNO} · ${ariza ? "Arızaya gönder" : "Kargoya ver"}`} onKapat={mesgul ? undefined : onKapat} genislik={760}>
      <div className="mb-3 rounded border bg-white px-3 py-2 text-[12px]">
        <div className="font-semibold">{kayit.CARIADI}</div>
        <div className="text-gray-600">
          {kayit.cihazlar.map((c) => [c.CINS, c.MARKA, c.MODEL].filter(Boolean).join(" ")).join(" · ") || "cihaz yok"}
        </div>
      </div>

      <div className="rounded border bg-white p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[13px] font-semibold">{ariza ? "Gönderilecek servis (alıcı)" : "Alıcı (müşteri)"}</span>
          {ariza && adresler.length > 0 && (
            <select className="ml-auto max-w-[360px] rounded border border-[#c7ccd4] px-2 py-1 text-[12px]" value=""
              onChange={(e) => e.target.value !== "" && setForm((f) => ({ ...f, ...adresSec(adresler[Number(e.target.value)]) }))}>
              <option value="">Kayıtlı servis adresinden seç…</option>
              {adresler.map((a, i) => (
                <option key={i} value={i}>{a.ALICIADI}{a.ALICIIL ? ` — ${a.ALICIIL}` : ""} ({a.ADET})</option>
              ))}
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <label className="col-span-2"><span className="mb-1 block text-gray-600">Alıcı adı / firma *</span>
            <input className={girdi} {...alan("ALICIADI")} autoFocus /></label>
          <label><span className="mb-1 block text-gray-600">Yetkili</span><input className={girdi} {...alan("ALICIYETKILI")} /></label>
          <label><span className="mb-1 block text-gray-600">Telefon</span><input className={girdi} {...alan("ALICITELEFON")} /></label>
          <label className="col-span-2"><span className="mb-1 block text-gray-600">Adres</span>
            <textarea rows={3} className={`${girdi} resize-y`} {...alan("ALICIADRES")} /></label>
          <label><span className="mb-1 block text-gray-600">İlçe / İl</span><input className={girdi} {...alan("ALICIIL")} /></label>
          <label><span className="mb-1 block text-gray-600">Kargo firması</span>
            <input className={girdi} list="kargo-firmalari" {...alan("KARGOFIRMASI")} />
            <datalist id="kargo-firmalari">{KARGO_FIRMALARI.map((k) => <option key={k} value={k} />)}</datalist></label>
          <label><span className="mb-1 block text-gray-600">Takip no (sonradan da girilebilir)</span><input className={girdi} {...alan("TAKIPNO")} /></label>
          <label><span className="mb-1 block text-gray-600">Not</span><input className={girdi} {...alan("NOTU")} /></label>
        </div>
      </div>

      <div className="mt-3 rounded border bg-white p-3 text-[12px]">
        <button type="button" onClick={() => setGonderenAcik((a) => !a)} className="flex w-full items-center text-left">
          <span className="font-semibold">Gönderen (etikette görünür)</span>
          <span className="ml-2 truncate text-gray-500">{gonderen.ad || "tanımlı değil"}</span>
          <span className="ml-auto text-gray-400">{gonderenAcik ? "▴" : "▾"}</span>
        </button>
        {gonderenAcik && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[["ad", "Firma adı", 2], ["yetkili", "Yetkili", 1], ["eposta", "E-posta", 1], ["adres", "Adres", 2], ["il", "İlçe / İl", 1], ["telefon", "Telefon", 1]].map(([k, etiket, span]) => (
              <label key={k} className={span === 2 ? "col-span-2" : undefined}>
                <span className="mb-1 block text-gray-600">{etiket}</span>
                <input className={girdi} value={gonderen[k] || ""} onChange={(e) => setGonderen((g) => ({ ...g, [k]: e.target.value }))} />
              </label>
            ))}
            <div className="col-span-2 flex items-center gap-2">
              <button type="button" onClick={gonderenKaydet} disabled={!gonderen.ad?.trim()}
                className="rounded border border-[#c7ccd4] px-3 py-1 disabled:opacity-40">Gönderen bilgisini kaydet</button>
              {gonderenMesaj && <span className={gonderenMesaj.hata ? "text-red-700" : "text-emerald-700"}>{gonderenMesaj.metin}</span>}
            </div>
          </div>
        )}
      </div>

      {hata && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-[12px] text-red-800">{hata}</div>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => kaydet(true)} disabled={mesgul}
          className="rounded bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40">
          {mesgul ? "Kaydediliyor…" : "Kaydet ve A5 adres etiketi yazdır"}
        </button>
        <button onClick={() => kaydet(false)} disabled={mesgul}
          className="rounded bg-blue-600 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40">Yalnız kaydet</button>
        <button type="button" disabled={mesgul}
          onClick={() => yazdir(`${kayit.SERVISNO} barkod`, barkodSayfasiHtml({ kayit })).catch((err) => setHata(err.message))}
          className="rounded border border-[#c7ccd4] bg-white px-4 py-2 text-[12px] disabled:opacity-40">Barkod çıktısı (A5)</button>
        <button onClick={onKapat} disabled={mesgul} className="ml-auto rounded border border-[#c7ccd4] bg-white px-4 py-2 text-[12px] disabled:opacity-40">Vazgeç</button>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        Kaydedince kayıt “{ariza ? "Arızaya gönderildi" : "Kargoya verildi"}” durumuna geçer ve
        “{ariza ? "Arızaya gönderilenler" : "Kargoya verilenler"}” listesinde görünür. A5 çıktı normal yazıcıya gider;
        yazdırma penceresinde kâğıt boyutunu A5 seçin. Logo ve yazıların yeri servis ekranındaki “A5 etiket tasarımı”ndan ayarlanır.
      </p>
    </Modal>
  );
}
