import { useState } from "react";
import { api, kullaniciAl, oturumAyarla } from "../api/client";

const pinGecerli = (pin) => /^\d{4,6}$/.test(pin);
const sadeceRakam = (fn) => (e) => fn(e.target.value.replace(/\D/g, "").slice(0, 6));

/** Oturumdaki kullanıcının PIN'ini belirler, değiştirir veya kaldırır. */
export default function PinAyari({ pinVar, onDegisti }) {
  const [mevcut, setMevcut] = useState("");
  const [yeni, setYeni] = useState("");
  const [tekrar, setTekrar] = useState("");
  const [mesaj, setMesaj] = useState(null);
  const [mesgul, setMesgul] = useState(false);

  async function calistir(yeniPin) {
    setMesaj(null);
    if (yeniPin !== null) {
      if (!pinGecerli(yeniPin)) return setMesaj({ hata: true, metin: "Yeni PIN 4-6 haneli rakam olmalı." });
      if (yeniPin !== tekrar) return setMesaj({ hata: true, metin: "PIN tekrarı eşleşmiyor." });
    }
    setMesgul(true);
    try {
      await api.pinKaydet({ mevcutPin: pinVar ? mevcut : undefined, yeniPin });
      if (yeniPin) {
        // PIN'i yeni tanımlanan kullanıcının sonraki istekleri reddedilmesin diye
        // aynı PIN'le hemen oturum açılır.
        const r = await api.giris({ kullanici: kullaniciAl(), pin: yeniPin });
        oturumAyarla(r.belirtec);
      }
      setMevcut("");
      setYeni("");
      setTekrar("");
      setMesaj({ hata: false, metin: yeniPin ? "PIN kaydedildi. Uygulama her açılışta PIN soracak." : "PIN kaldırıldı." });
      onDegisti?.(Boolean(yeniPin));
    } catch (err) {
      setMesaj({ hata: true, metin: err.message });
    } finally {
      setMesgul(false);
    }
  }

  const alan = "w-full rounded border border-[#c7ccd4] px-3 py-1.5 text-center font-mono text-[16px] tracking-[0.4em] outline-none focus:border-blue-500";
  return (
    <form onSubmit={(e) => { e.preventDefault(); calistir(yeni); }} className="rounded border bg-white p-4">
      <p className="mb-3 text-[12px] text-gray-600">
        <strong>{kullaniciAl()}</strong> için giriş PIN'i. İsteğe bağlıdır; tanımlanırsa uygulama açılırken ve
        kullanıcı değiştirirken 4-6 haneli PIN sorulur.
      </p>
      <div className="grid grid-cols-3 gap-2 text-[12px]">
        {pinVar && (
          <label><span className="mb-1 block text-gray-600">Mevcut PIN</span>
            <input type="password" inputMode="numeric" value={mevcut} onChange={sadeceRakam(setMevcut)} className={alan} autoFocus /></label>
        )}
        <label><span className="mb-1 block text-gray-600">Yeni PIN</span>
          <input type="password" inputMode="numeric" value={yeni} onChange={sadeceRakam(setYeni)} className={alan} autoFocus={!pinVar} /></label>
        <label><span className="mb-1 block text-gray-600">Yeni PIN (tekrar)</span>
          <input type="password" inputMode="numeric" value={tekrar} onChange={sadeceRakam(setTekrar)} className={alan} /></label>
      </div>
      {mesaj && <div className={`mt-3 rounded px-3 py-2 text-[12px] ${mesaj.hata ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{mesaj.metin}</div>}
      <div className="mt-3 flex gap-2">
        <button disabled={mesgul || !yeni} className="rounded bg-blue-600 px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
          {pinVar ? "PIN'i değiştir" : "PIN belirle"}
        </button>
        {pinVar && (
          <button type="button" disabled={mesgul || !mevcut} onClick={() => calistir(null)}
            className="ml-auto rounded border border-red-300 px-4 py-1.5 text-[12px] text-red-700 disabled:opacity-40">PIN'i kaldır</button>
        )}
      </div>
    </form>
  );
}
