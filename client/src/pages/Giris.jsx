import { useEffect, useState } from "react";
import { api, kullaniciAyarla, oturumAyarla } from "../api/client";

/**
 * Kullanıcı seçimi ve isteğe bağlı PIN girişi. PIN'i olmayan kullanıcı tek
 * tıkla girer; PIN tanımlıysa 4-6 haneli PIN sorulur.
 */
export default function Giris({ varsayilan, onGiris, onVazgec }) {
  const [liste, setListe] = useState(null);
  const [secili, setSecili] = useState(null);
  const [yeniAd, setYeniAd] = useState("");
  const [pin, setPin] = useState("");
  const [hata, setHata] = useState(null);
  const [mesgul, setMesgul] = useState(false);

  useEffect(() => {
    api.kullaniciListe()
      .then((r) => {
        setListe(r.kullanicilar);
        const bulunan = r.kullanicilar.find((k) => k.kullanici === varsayilan);
        if (bulunan) setSecili(bulunan);
      })
      .catch((err) => { setListe([]); setHata(err.message); });
  }, [varsayilan]);

  async function gir(e) {
    e?.preventDefault();
    const ad = secili?.kullanici || yeniAd.trim();
    if (!ad || mesgul) return;
    if (secili?.pinVar && !/^\d{4,6}$/.test(pin)) {
      setHata("PIN 4-6 haneli olmalı.");
      return;
    }
    setMesgul(true);
    setHata(null);
    try {
      const r = await api.giris({ kullanici: ad, pin: secili?.pinVar ? pin : undefined });
      oturumAyarla(r.belirtec);
      kullaniciAyarla(r.kullanici);
      onGiris?.(r);
    } catch (err) {
      setHata(err.message);
      setPin("");
    } finally {
      setMesgul(false);
    }
  }

  function sec(k) {
    setSecili(k);
    setYeniAd("");
    setPin("");
    setHata(null);
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <form onSubmit={gir} className="w-[440px] rounded-lg border bg-white p-5 shadow-sm">
        <div className="text-[18px] font-semibold">Vega Müşteri İşlemleri</div>
        <div className="mb-4 text-[12px] text-gray-500">Kullanıcı seçin</div>

        {!liste ? (
          <div className="py-4 text-[12px] text-gray-500">Kullanıcılar yükleniyor…</div>
        ) : (
          <div className="grid max-h-[260px] grid-cols-2 gap-2 overflow-auto">
            {liste.map((k) => (
              <button type="button" key={k.kullanici} onClick={() => sec(k)}
                className={`flex items-center gap-2 rounded border px-3 py-2 text-left text-[13px] ${secili?.kullanici === k.kullanici ? "border-blue-500 bg-blue-50 font-semibold" : "border-[#c7ccd4] hover:bg-gray-50"}`}>
                <span className="truncate">{k.kullanici}</span>
                {k.pinVar && <span className="ml-auto text-[11px] text-gray-500" title="PIN ile giriş">🔒</span>}
              </button>
            ))}
          </div>
        )}

        <label className="mt-3 block text-[12px]">
          <span className="mb-1 block text-gray-600">Listede yoksanız adınızı yazın</span>
          <input value={yeniAd} maxLength={60}
            onChange={(e) => { setYeniAd(e.target.value); setSecili(null); setPin(""); }}
            className="w-full rounded border border-[#c7ccd4] px-2 py-1.5 outline-none focus:border-blue-500" />
        </label>

        {secili?.pinVar && (
          <label className="mt-3 block text-[12px]">
            <span className="mb-1 block text-gray-600">{secili.kullanici} için PIN</span>
            <input type="password" inputMode="numeric" autoComplete="off" autoFocus maxLength={6}
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded border border-[#c7ccd4] px-3 py-2 text-center font-mono text-[22px] tracking-[0.5em] outline-none focus:border-blue-500" />
          </label>
        )}

        {hata && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-[12px] text-red-800">{hata}</div>}

        <div className="mt-4 flex gap-2">
          <button disabled={mesgul || !(secili || yeniAd.trim())}
            className="flex-1 rounded bg-blue-600 py-2 font-semibold text-white disabled:opacity-40">
            {mesgul ? "Giriş yapılıyor…" : "Giriş"}
          </button>
          {onVazgec && (
            <button type="button" onClick={onVazgec} disabled={mesgul}
              className="rounded border border-[#c7ccd4] px-4 py-2 disabled:opacity-40">Vazgeç</button>
          )}
        </div>
      </form>
    </div>
  );
}
