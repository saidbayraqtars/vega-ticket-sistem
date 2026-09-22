import { useState } from "react";

/**
 * Servis kaydının şirket içi not kutusu: müşteriye sunulan fiyat teklifi ve
 * cihaza yapılan işlemler. Buradaki hiçbir metin müşteriye gönderilmez;
 * WhatsApp mesajlarıyla ilgisi yoktur.
 */
const NOT_TURLERI = [
  { kod: "TEKLIF", ad: "Fiyat teklifi", sinif: "bg-amber-100 text-amber-900" },
  { kod: "ISLEM", ad: "Yapılan işlem", sinif: "bg-blue-100 text-blue-900" },
  { kod: "NOT", ad: "İç not", sinif: "bg-gray-200 text-gray-700" },
];
const NOT_SINIRI = 2000;
const turBilgi = (kod) => NOT_TURLERI.find((t) => t.kod === kod) || NOT_TURLERI[2];
const tarihSaat = (d) => (d ? new Date(d).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—");
const tutarGoster = (t) =>
  t === null || t === undefined ? "" : `${Number(t).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

export default function ServisNotlari({ notlar = [], mesgul, onEkle, onGuncelle, onSil }) {
  const [acik, setAcik] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState(null);
  const teklifler = notlar.filter((n) => n.TUR === "TEKLIF" && n.TUTAR !== null && n.TUTAR !== undefined);
  const sonTeklif = teklifler[0] || null;

  async function ekle(notu) {
    if (await onEkle(notu)) {
      setAcik(false);
      return true;
    }
    return false;
  }

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[12px] font-semibold">Şirket içi notlar ({notlar.length})</span>
        <span className="text-[11px] text-gray-500">müşteriye gönderilmez</span>
        {sonTeklif && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
            Son teklif: {tutarGoster(sonTeklif.TUTAR)}
          </span>
        )}
        <button onClick={() => { setAcik((o) => !o); setDuzenlenen(null); }}
          className="ml-auto rounded border border-[#c7ccd4] bg-white px-2.5 py-1 text-[11px]">
          {acik ? "Vazgeç" : "+ Not ekle"}
        </button>
      </div>

      {acik && <NotFormu mesgul={mesgul} onKaydet={ekle} onVazgec={() => setAcik(false)} />}

      {notlar.map((n) => (
        duzenlenen === n.ID ? (
          <NotFormu key={n.ID} baslangic={n} mesgul={mesgul}
            onKaydet={async (notu) => (await onGuncelle(n.ID, notu)) ? (setDuzenlenen(null), true) : false}
            onVazgec={() => setDuzenlenen(null)} />
        ) : (
          <div key={n.ID} className="mt-1.5 rounded border bg-white p-3 text-[12px]">
            <div className="flex items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${turBilgi(n.TUR).sinif}`}>{turBilgi(n.TUR).ad}</span>
              {n.TUTAR !== null && n.TUTAR !== undefined && <span className="font-semibold">{tutarGoster(n.TUTAR)}</span>}
              <span className="ml-auto text-[11px] text-gray-500">
                {tarihSaat(n.TARIH)} · {n.YAZAN}
                {n.GUNCELLEMETARIHI ? ` · ${n.DUZENLEYEN} düzenledi` : ""}
              </span>
            </div>
            <div className="mt-1.5 whitespace-pre-line rounded bg-gray-50 px-2 py-1.5">{n.METIN}</div>
            <div className="mt-1.5 flex gap-3 text-[11px]">
              <button disabled={mesgul} onClick={() => { setAcik(false); setDuzenlenen(n.ID); }}
                className="text-blue-700 hover:underline disabled:opacity-40">düzenle</button>
              <button disabled={mesgul} onClick={() => onSil(n.ID)}
                className="text-red-700 hover:underline disabled:opacity-40">sil</button>
            </div>
          </div>
        )
      ))}

      {!notlar.length && !acik && (
        <div className="rounded border border-dashed bg-white px-3 py-2 text-[11px] text-gray-500">
          Verilen fiyat teklifini ve yapılan işlemi buraya yazın. Yalnız şirket içinde görünür.
        </div>
      )}
    </div>
  );
}

function NotFormu({ baslangic, mesgul, onKaydet, onVazgec }) {
  const [tur, setTur] = useState(baslangic?.TUR || "TEKLIF");
  const [tutar, setTutar] = useState(baslangic?.TUTAR ?? "");
  const [metin, setMetin] = useState(baslangic?.METIN || "");

  return (
    <div className="mt-1.5 rounded border border-[#c7ccd4] bg-white p-3 text-[12px]">
      <div className="flex items-center gap-2">
        <select value={tur} onChange={(e) => setTur(e.target.value)}
          className="rounded border border-[#c7ccd4] px-2 py-1">
          {NOT_TURLERI.map((t) => <option key={t.kod} value={t.kod}>{t.ad}</option>)}
        </select>
        <input value={tutar} onChange={(e) => setTutar(e.target.value)} placeholder="Tutar (isteğe bağlı)"
          className="w-40 rounded border border-[#c7ccd4] px-2 py-1 text-right outline-none focus:border-blue-500" />
        <span className="text-[11px] text-gray-500">₺ · boş bırakılabilir</span>
      </div>
      <textarea value={metin} onChange={(e) => setMetin(e.target.value)} maxLength={NOT_SINIRI} rows={3} autoFocus
        placeholder="Örn: Müşteriye 1.500 ₺ teklif verildi, onay bekleniyor."
        className="mt-1.5 w-full resize-y rounded border border-[#c7ccd4] px-2 py-1.5 outline-none focus:border-blue-500" />
      <div className="mt-1 flex items-center gap-1.5">
        <button disabled={mesgul || !metin.trim()}
          onClick={() => onKaydet({ TUR: tur, METIN: metin, TUTAR: tutar })}
          className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Kaydet</button>
        <button onClick={onVazgec} className="rounded border border-[#c7ccd4] px-2.5 py-1 text-[11px]">Vazgeç</button>
        <span className="ml-auto text-[10px] text-gray-400">{metin.length}/{NOT_SINIRI}</span>
      </div>
    </div>
  );
}
