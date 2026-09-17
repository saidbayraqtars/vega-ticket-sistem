import { useEffect, useState } from "react";
import { api } from "../api/client";
import { SERVIS_MESAJ_TURLERI, cepNormalize, telefonGoster } from "../lib/servisMesaj";
import Modal from "./Modal";

const NUMARA_SINIRI = 3;
const KAYNAK_ADI = { servis: "servis kaydı", cari: "cari kartı", elle: "elle eklendi" };

/**
 * Servis kaydından müşteriye isteğe bağlı WhatsApp mesajı. Tür seçilince
 * ortak şablon kayıt bilgileriyle doldurulur; metin ve numaralar gönderimden
 * önce değiştirilebilir. Hiçbir şey kullanıcı "Gönder" demeden gitmez.
 */
export default function ServisWhatsappPenceresi({ kayit, tur: ilkTur = "GENEL", onKapat, onGonderildi }) {
  const [tur, setTur] = useState(ilkTur);
  const [taslaklar, setTaslaklar] = useState(null);
  const [metin, setMetin] = useState("");
  const [adaylar, setAdaylar] = useState([]);
  const [secili, setSecili] = useState([]);
  const [yeniNumara, setYeniNumara] = useState("");
  const [waDurum, setWaDurum] = useState(null);
  const [uyari, setUyari] = useState(null);
  const [hata, setHata] = useState(null);
  const [mesgul, setMesgul] = useState(false);

  useEffect(() => {
    let iptal = false;
    api.servisWhatsappTaslak(kayit.ID)
      .then((r) => {
        if (iptal) return;
        setTaslaklar(r.taslaklar);
        setMetin(r.taslaklar[ilkTur] || "");
        setAdaylar(r.telefonlar);
        // Cihazı getirenin numarası öncelikli; yoksa carinin numaraları.
        const servisNumaralari = r.telefonlar.filter((t) => t.kaynak === "servis");
        setSecili((servisNumaralari.length ? servisNumaralari : r.telefonlar).slice(0, NUMARA_SINIRI).map((t) => t.telefon));
        setUyari(r.uyari || null);
      })
      .catch((err) => !iptal && setHata(err.message));
    api.whatsappDurum().then((d) => !iptal && setWaDurum(d)).catch(() => { /* yalnız bilgi amaçlı */ });
    return () => { iptal = true; };
    // Pencere her açılışta bir kez doldurulur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kayit.ID]);

  const duzenlendi = taslaklar && metin !== (taslaklar[tur] || "");

  function turSec(yeni) {
    if (yeni === tur || !taslaklar) return;
    if (duzenlendi && !window.confirm("Düzenlediğiniz metin seçilen türün şablonuyla değiştirilecek. Devam edilsin mi?")) return;
    setTur(yeni);
    setMetin(taslaklar[yeni] || "");
  }

  function numaraDegistir(telefon, isaretli) {
    setSecili((liste) => (isaretli ? [...liste, telefon].slice(0, NUMARA_SINIRI) : liste.filter((t) => t !== telefon)));
  }

  function numaraEkle() {
    const telefon = cepNormalize(yeniNumara);
    if (!telefon) {
      setHata("Geçerli bir cep telefonu yazın (ör. 0532 123 45 67).");
      return;
    }
    setHata(null);
    setAdaylar((liste) => (liste.some((a) => a.telefon === telefon) ? liste : [...liste, { telefon, kaynak: "elle" }]));
    setSecili((liste) => (liste.includes(telefon) || liste.length >= NUMARA_SINIRI ? liste : [...liste, telefon]));
    setYeniNumara("");
  }

  async function gonder() {
    setMesgul(true);
    setHata(null);
    try {
      const r = await api.servisWhatsappGonder(kayit.ID, { TUR: tur, METIN: metin, TELEFONLAR: secili });
      onGonderildi(r.kayit, r.mesaj);
    } catch (err) {
      setHata(err.message);
    } finally {
      setMesgul(false);
    }
  }

  return (
    <Modal baslik={`${kayit.SERVISNO} · WhatsApp mesajı`} onKapat={mesgul ? undefined : onKapat} genislik={680}>
      <div className="mb-3 rounded border bg-white px-3 py-2 text-[12px]">
        <div className="font-semibold">{kayit.CARIADI}</div>
        <div className="text-gray-600">
          {(kayit.cihazlar || []).map((c) => [c.CINS, c.MARKA, c.MODEL].filter(Boolean).join(" ")).join(" · ") || "cihaz yok"}
        </div>
      </div>

      <div className="rounded border bg-white p-3">
        <div className="mb-1 text-[12px] font-semibold">Mesaj türü</div>
        <div className="flex flex-wrap gap-1.5">
          {SERVIS_MESAJ_TURLERI.map((t) => (
            <button key={t.kod} type="button" onClick={() => turSec(t.kod)} disabled={!taslaklar}
              className={`rounded-full px-3 py-1 text-[11px] disabled:opacity-40 ${tur === t.kod ? "bg-emerald-600 font-semibold text-white" : "border border-[#c7ccd4] bg-white"}`}>
              {t.ad}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center">
          <span className="text-[12px] font-semibold">Gönderilecek metin</span>
          {duzenlendi && (
            <button type="button" onClick={() => setMetin(taslaklar[tur] || "")}
              className="ml-auto text-[11px] text-blue-700 hover:underline">Şablondaki metne dön</button>
          )}
        </div>
        <textarea value={taslaklar ? metin : "Yükleniyor…"} onChange={(e) => setMetin(e.target.value)}
          disabled={!taslaklar} maxLength={1000} rows={6} autoFocus
          className="mt-1 w-full resize-y rounded border border-[#c7ccd4] px-3 py-2 text-[13px] outline-none focus:border-emerald-500 disabled:bg-gray-50" />
        <div className="flex text-[10px] text-gray-500">
          <span>Metni burada değiştirmek yalnız bu mesajı etkiler; ortak şablon “WhatsApp şablonları”ndan düzenlenir.</span>
          <span className="ml-auto">{metin.length}/1000</span>
        </div>
      </div>

      <div className="mt-3 rounded border bg-white p-3 text-[12px]">
        <div className="mb-1 flex items-center">
          <span className="font-semibold">Gideceği numaralar</span>
          <span className="ml-2 text-[11px] text-gray-500">en çok {NUMARA_SINIRI}</span>
        </div>
        {adaylar.map((a) => {
          const isaretli = secili.includes(a.telefon);
          return (
            <label key={a.telefon} className="flex items-center gap-2 py-0.5">
              <input type="checkbox" checked={isaretli}
                disabled={!isaretli && secili.length >= NUMARA_SINIRI}
                onChange={(e) => numaraDegistir(a.telefon, e.target.checked)} />
              <span className="font-mono">{telefonGoster(a.telefon)}</span>
              <span className="text-[11px] text-gray-500">{KAYNAK_ADI[a.kaynak] || a.kaynak}</span>
            </label>
          );
        })}
        {taslaklar && !adaylar.length && (
          <div className="text-red-700">Serviste ve cari kartında cep telefonu yok. Aşağıdan numara ekleyin.</div>
        )}
        <div className="mt-2 flex gap-1.5">
          <input value={yeniNumara} onChange={(e) => setYeniNumara(e.target.value)} placeholder="Başka numara: 05xx xxx xx xx"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); numaraEkle(); } }}
            className="w-56 rounded border border-[#c7ccd4] px-2 py-1 font-mono outline-none focus:border-emerald-500" />
          <button type="button" onClick={numaraEkle} disabled={!yeniNumara.trim()}
            className="rounded border border-[#c7ccd4] px-3 py-1 text-[11px] disabled:opacity-40">Ekle</button>
        </div>
      </div>

      {waDurum && !waDurum.hazir && (
        <div className="mt-3 rounded bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          WhatsApp şu an bağlı değil{waDurum.anaMakine ? ` (ana bilgisayar: ${waDurum.anaMakine})` : ""}. Mesaj sıraya alınır;
          30 dakika içinde bağlantı gelmezse iptal olur, kayıttan tekrar gönderebilirsiniz.
        </div>
      )}
      {uyari && <div className="mt-3 rounded bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{uyari}</div>}
      {hata && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-[12px] text-red-800">{hata}</div>}

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={gonder} disabled={mesgul || !taslaklar || !metin.trim() || !secili.length}
          className="rounded bg-emerald-600 px-5 py-2 text-[12px] font-semibold text-white disabled:opacity-40">
          {mesgul ? "Gönderiliyor…" : `Gönder${secili.length > 1 ? ` (${secili.length} numara)` : ""}`}
        </button>
        <button type="button" onClick={onKapat} disabled={mesgul}
          className="ml-auto rounded border border-[#c7ccd4] bg-white px-5 py-2 text-[12px] disabled:opacity-40">Vazgeç</button>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        Mesaj ana WhatsApp bilgisayarından gönderilir. Durumu servis kaydının “WhatsApp mesajları” bölümünde görünür;
        gönderilemeyen mesaj orada düzenlenip tekrar gönderilebilir.
      </p>
    </Modal>
  );
}
