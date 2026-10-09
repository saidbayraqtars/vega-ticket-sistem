import { useEffect, useRef, useState } from "react";
import { SAYFA } from "../lib/adresEtiketi";
import { A4_YARI_MM, yazdirmaPenceresiBagla } from "../lib/yazdir";
import Modal from "./Modal";

const PX_MM = 96 / 25.4;
const ONIZLEME = { genislik: 560, yukseklik: 520 };
const YAZICI_ANAHTARI = "vt.a5Yazici";
const KAGIT_ANAHTARI = "vt.a5Kagit";
const tercihOku = (anahtar) => { try { return localStorage.getItem(anahtar) || ""; } catch { return ""; } };
const tercihYaz = (anahtar, deger) => { try { localStorage.setItem(anahtar, deger); } catch { /* tercih kaydedilemezse de çalışır */ } };

// A4 takılı yazıcıda A5 sayfa A4'ün ortasına basılıyor; varsayılan A4'ün üst yarısıdır.
const KAGITLAR = {
  a4yari: { ad: "A4'ün yarısı", aciklama: "A4 kâğıdın üst yarısına yatay basılır" },
  a5: { ad: "A5 kâğıt", aciklama: "Yazıcıya A5 kâğıt takılı olmalı" },
};
const kagitTercihi = () => (tercihOku(KAGIT_ANAHTARI) in KAGITLAR ? tercihOku(KAGIT_ANAHTARI) : "a4yari");

/**
 * Masaüstü uygulamasında A5 çıktının önizlemesi ve yazıcı seçimi. Electron'un
 * kendi yazdırma penceresinde önizleme yoktur ve kâğıt A4 gelir; burada sayfa
 * olduğu gibi gösterilir, baskı seçilen kâğıtla (A5 ya da A4'ün üst yarısı)
 * ana süreçten yapılır.
 * lib/yazdir.js `yazdir()` çağrılınca açılır; uygulamada bir kez bulunur.
 */
export default function A5YazdirmaPenceresi() {
  const [is, setIs] = useState(null);
  const [yazicilar, setYazicilar] = useState(null);
  const [yazici, setYazici] = useState("");
  const [kopya, setKopya] = useState(1);
  const [kagit, setKagit] = useState(kagitTercihi);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState(null);
  const acik = useRef(null);

  useEffect(() => yazdirmaPenceresiBagla((yeni) => {
    acik.current?.bitti();
    acik.current = yeni;
    setIs(yeni);
    setKopya(1);
    setKagit(kagitTercihi());
    setHata(null);
    setYazicilar(null);
    window.vegaMasaustu.yazicilar()
      .then((r) => {
        if (!r.tamam) throw new Error(r.hata);
        setYazicilar(r.yazicilar);
        // Son kullanılan yazıcı kaldırıldıysa Windows varsayılanına dönülür.
        const son = tercihOku(YAZICI_ANAHTARI);
        setYazici(r.yazicilar.some((y) => y.ad === son) ? son : "");
      })
      .catch((err) => {
        setYazicilar([]);
        setYazici("");
        setHata(`Yazıcı listesi okunamadı: ${err.message}`);
      });
  }), []);

  function kapat() {
    acik.current?.bitti();
    acik.current = null;
    setIs(null);
  }

  // Alttaki pencere de Esc'yi dinler; yalnız bu pencere kapansın diye olay önce burada tutulur.
  const vazgec = useRef(null);
  vazgec.current = mesgul ? null : kapat;
  useEffect(() => {
    if (!is) return undefined;
    const tus = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      vazgec.current?.();
    };
    window.addEventListener("keydown", tus, true);
    return () => window.removeEventListener("keydown", tus, true);
  }, [is]);

  if (!is) return null;

  async function bas() {
    setMesgul(true);
    setHata(null);
    try {
      const a4 = kagit === "a4yari";
      const r = await window.vegaMasaustu.a5Yazdir({
        html: is.kagitlar[kagit].html, kagit: a4 ? "A4" : "A5", yatay: !a4 && is.yon === "yatay",
        kenarsiz: is.kenar === 0, yazici, kopya,
      });
      if (!r.tamam) throw new Error(r.hata);
      tercihYaz(YAZICI_ANAHTARI, yazici);
      tercihYaz(KAGIT_ANAHTARI, kagit);
      kapat();
    } catch (err) {
      setHata(err.message);
    } finally {
      setMesgul(false);
    }
  }

  const sayfa = kagit === "a4yari" ? { genislik: 210, yukseklik: 297 } : SAYFA[is.yon];
  const genislik = sayfa.genislik * PX_MM;
  const yukseklik = sayfa.yukseklik * PX_MM;
  const olcek = Math.min(ONIZLEME.genislik / genislik, ONIZLEME.yukseklik / yukseklik);

  return (
    <Modal baslik={`Yazdır · ${is.baslik}`} onKapat={mesgul ? undefined : kapat} genislik={900}>
      <div className="flex gap-4">
        <div className="shrink-0">
          <div className="overflow-hidden border border-[#b9bfc7] bg-white shadow"
            style={{ width: genislik * olcek, height: yukseklik * olcek }}>
            <iframe title="Baskı önizleme" sandbox="" srcDoc={is.kagitlar[kagit].onizleme}
              style={{ width: genislik, height: yukseklik, border: 0, transform: `scale(${olcek})`, transformOrigin: "0 0" }} />
          </div>
          <div className="mt-1 text-[11px] text-gray-500">
            {kagit === "a4yari"
              ? `Önizleme · A4, üst yarı (210 × ${String(A4_YARI_MM).replace(".", ",")} mm)`
              : `Önizleme · A5 ${is.yon} (${sayfa.genislik} × ${sayfa.yukseklik} mm)`}
            {is.kenar > 0 && " · sığmayan kartlar sonraki sayfaya geçer"}
          </div>
        </div>

        <div className="min-w-0 flex-1 text-[12px]">
          <div className="rounded border bg-white p-3">
            <label className="block">
              <span className="mb-1 block text-gray-600">Yazıcı</span>
              <select value={yazici} onChange={(e) => setYazici(e.target.value)} disabled={!yazicilar || mesgul}
                className="w-full rounded border border-[#c7ccd4] bg-white px-2 py-1 outline-none focus:border-blue-500">
                <option value="">{yazicilar ? "Windows varsayılan yazıcısı" : "Yazıcılar okunuyor…"}</option>
                {(yazicilar || []).map((y) => <option key={y.ad} value={y.ad}>{y.gorunenAd}</option>)}
              </select>
            </label>
            <fieldset className="mt-2">
              <legend className="mb-1 text-gray-600">Kâğıt</legend>
              {Object.entries(KAGITLAR).map(([anahtar, k]) => (
                <label key={anahtar} className="flex items-start gap-1.5 py-0.5">
                  <input type="radio" name="kagit" className="mt-0.5" checked={kagit === anahtar} disabled={mesgul}
                    onChange={() => setKagit(anahtar)} />
                  <span><span className="font-semibold text-gray-800">{k.ad}</span>
                    <span className="block text-[11px] text-gray-500">{k.aciklama}</span></span>
                </label>
              ))}
            </fieldset>
            <label className="mt-2 block w-24">
              <span className="mb-1 block text-gray-600">Adet</span>
              <input type="number" min={1} max={20} value={kopya} disabled={mesgul}
                onChange={(e) => setKopya(Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), 20))}
                className="w-full rounded border border-[#c7ccd4] px-2 py-1 text-right outline-none focus:border-blue-500" />
            </label>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-gray-600">
              <dt>Kâğıt</dt><dd className="font-semibold text-gray-800">{kagit === "a4yari" ? "A4 dikey, üst yarı" : `A5 ${is.yon}`}</dd>
              <dt>Ölçek</dt><dd>%100</dd>
              <dt>Kenar boşluğu</dt><dd>{is.kenar > 0 ? `${is.kenar} mm` : "Yok"}</dd>
            </dl>
          </div>

          {hata && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-[11px] text-red-800">{hata}</div>}

          <div className="mt-3 flex gap-2">
            <button type="button" onClick={bas} disabled={mesgul || !yazicilar} autoFocus
              className="rounded bg-emerald-600 px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
              {mesgul ? "Yazıcıya gönderiliyor…" : "Yazdır"}
            </button>
            <button type="button" onClick={kapat} disabled={mesgul}
              className="rounded border border-[#c7ccd4] bg-white px-4 py-1.5 text-[12px] disabled:opacity-40">Vazgeç</button>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            Kâğıt boyutu seçime göre A4 ya da A5 olarak gönderilir. Seçilen yazıcı ve kâğıt bu bilgisayarda hatırlanır.
          </p>
        </div>
      </div>
    </Modal>
  );
}
