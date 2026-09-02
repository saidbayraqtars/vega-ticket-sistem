import { useEffect, useState } from "react";
import { api } from "../api/client";
import EtiketOnizleme from "./EtiketOnizleme";

/**
 * Etiket yazıcısı ayarı bu bilgisayara özeldir (config.json). WhatsApp'ın
 * aksine merkezî değil: etiket, yazıcının bağlı olduğu makineden basılır.
 */
export default function EtiketAyarlari() {
  const [ayar, setAyar] = useState(null);
  const [ornek, setOrnek] = useState(null);
  const [yazicilar, setYazicilar] = useState([]);
  const [mesgul, setMesgul] = useState(false);
  const [mesaj, setMesaj] = useState(null);
  const [hata, setHata] = useState(null);
  const [komut, setKomut] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [a, y] = await Promise.all([api.etiketAyar(), api.etiketYazicilar()]);
        setAyar(a.ayar);
        setOrnek(a.ornek);
        setYazicilar(y.yazicilar || []);
        if (y.mesaj) setHata(`Yazıcı listesi alınamadı: ${y.mesaj}`);
      } catch (err) {
        setHata(err.message);
      }
    })();
  }, []);

  const degistir = (yama) => setAyar((o) => ({ ...o, ...yama }));

  async function sarmala(is, basariMesaji) {
    setMesgul(true);
    setMesaj(null);
    setHata(null);
    try {
      const r = await is();
      if (basariMesaji) setMesaj(basariMesaji);
      return r;
    } catch (err) {
      setHata(err.message);
      return null;
    } finally {
      setMesgul(false);
    }
  }

  const kaydet = () =>
    sarmala(async () => setAyar((await api.etiketAyarKaydet(ayar)).ayar), "Etiket ayarı kaydedildi.");
  const dene = () =>
    sarmala(async () => {
      const r = await api.etiketDene(ayar);
      setMesaj(`Deneme etiketi gönderildi → ${r.sonuc?.yazici || "varsayılan yazıcı"}`);
    });
  const dilDene = () =>
    sarmala(async () => setMesaj((await api.etiketDilDene(ayar)).mesaj));
  const komutGoster = () =>
    sarmala(async () => setKomut((await api.etiketOnizleme({ ayar })).metin));

  if (!ayar) {
    return (
      <fieldset className="mb-5 rounded border border-[#dfe3e8] bg-white p-4">
        <legend className="px-1 text-[12px] font-semibold text-gray-600">Etiket yazıcısı</legend>
        <div className="text-[12px] text-gray-500">{hata || "Yükleniyor…"}</div>
      </fieldset>
    );
  }

  const hamYol = ayar.yontem === "ham";
  const varsayilanYazici = yazicilar.find((y) => y.varsayilan)?.ad;

  return (
    <fieldset className="mb-5 rounded border border-[#dfe3e8] bg-white p-4">
      <legend className="px-1 text-[12px] font-semibold text-gray-600">Etiket yazıcısı</legend>

      <div className="grid grid-cols-[1fr_200px] gap-3">
        <label className="text-[12px]">
          <span className="mb-1 block text-gray-600">Yazıcı</span>
          <select value={ayar.yazici} onChange={(e) => degistir({ yazici: e.target.value })}
            className="w-full rounded border border-[#c7ccd4] px-2 py-1">
            <option value="">
              Windows varsayılan yazıcısı{varsayilanYazici ? ` — ${varsayilanYazici}` : ""}
            </option>
            {yazicilar.map((y) => (
              <option key={y.ad} value={y.ad}>
                {y.ad}{y.varsayilan ? " (varsayılan)" : ""}{y.cevrimdisi ? " — çevrimdışı" : ""}
              </option>
            ))}
            {ayar.yazici && !yazicilar.some((y) => y.ad === ayar.yazici) && (
              <option value={ayar.yazici}>{ayar.yazici} (bağlı değil)</option>
            )}
          </select>
          {!ayar.yazici && (
            <span className="mt-0.5 block text-[11px] text-amber-700">
              Etiket, o an hangi yazıcı varsayılansa oraya gider. Etiket yazıcısını burada seçmek daha güvenli.
            </span>
          )}
        </label>

        <label className="text-[12px]">
          <span className="mb-1 block text-gray-600">Basma yolu</span>
          <select value={ayar.yontem} onChange={(e) => degistir({ yontem: e.target.value })}
            className="w-full rounded border border-[#c7ccd4] px-2 py-1">
            <option value="surucu">Windows sürücüsü (önerilen)</option>
            <option value="ham">Ham komut (ZPL / TSPL)</option>
          </select>
          <span className="mt-0.5 block text-[11px] text-gray-400">
            {hamYol
              ? "Sürücü etiketi yanlış ölçekliyorsa kullanın."
              : "Her yazıcıda çalışır, Türkçe sorunsuz."}
          </span>
        </label>
      </div>

      {hamYol && (
        <label className="mt-3 block max-w-[300px] text-[12px]">
          <span className="mb-1 block text-gray-600">Komut dili</span>
          <select value={ayar.dil} onChange={(e) => degistir({ dil: e.target.value })}
            className="w-full rounded border border-[#c7ccd4] px-2 py-1">
            <option value="TSPL">TSPL — TSC / Argox / Godex / ZYWELL</option>
            <option value="ZPL">ZPL — Zebra</option>
          </select>
          <span className="mt-0.5 block text-[11px] text-gray-400">ZY910 etiket modunda TSPL konuşur.</span>
        </label>
      )}

      <div className="mt-3 grid grid-cols-6 gap-2">
        <Sayi etiket="Genişlik mm" value={ayar.genislikMm} onChange={(v) => degistir({ genislikMm: v })} />
        <Sayi etiket="Yükseklik mm" value={ayar.yukseklikMm} onChange={(v) => degistir({ yukseklikMm: v })} />
        <Sayi etiket="Kopya" value={ayar.adet} onChange={(v) => degistir({ adet: v })} />
        {hamYol && (
          <>
            <label className="text-[12px]">
              <span className="mb-1 block text-gray-600">Çözünürlük</span>
              <select value={ayar.dpi} onChange={(e) => degistir({ dpi: Number(e.target.value) })}
                className="w-full rounded border border-[#c7ccd4] px-2 py-1">
                {[203, 300, 600].map((d) => <option key={d} value={d}>{d} dpi</option>)}
              </select>
            </label>
            <Sayi etiket="Koyuluk" value={ayar.koyuluk} onChange={(v) => degistir({ koyuluk: v })} />
            {ayar.dil === "TSPL" && (
              <Sayi etiket="Ara boşluk mm" value={ayar.bosluk} onChange={(v) => degistir({ bosluk: v })} />
            )}
          </>
        )}
      </div>

      {hamYol && (
        <label className="mt-3 flex items-center gap-2 text-[12px] text-gray-700">
          <input type="checkbox" checked={ayar.asciiyeIndir}
            onChange={(e) => degistir({ asciiyeIndir: e.target.checked })} />
          Türkçe karakterleri ASCII&apos;ye indir (yazıcı ş/ğ/ı basamıyorsa açın)
        </label>
      )}

      <div className="mt-3 flex flex-wrap items-start gap-4">
        <div>
          <div className="mb-1 text-[11px] font-semibold text-gray-600">Önizleme</div>
          <EtiketOnizleme etiket={ornek || {}} genislikMm={ayar.genislikMm} yukseklikMm={ayar.yukseklikMm} />
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={kaydet} disabled={mesgul}
            className="rounded bg-emerald-600 px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
            Kaydet
          </button>
          <button type="button" onClick={dene} disabled={mesgul}
            className="rounded border border-[#c7ccd4] px-4 py-1.5 text-[12px] disabled:opacity-40">
            Deneme bas
          </button>
          {hamYol && (
            <button type="button" onClick={dilDene} disabled={mesgul}
              className="rounded border border-[#c7ccd4] px-4 py-1.5 text-[12px] disabled:opacity-40">
              Dili bul
            </button>
          )}
          <button type="button" onClick={komutGoster} disabled={mesgul}
            className="rounded border border-[#c7ccd4] px-4 py-1.5 text-[12px] disabled:opacity-40">
            {hamYol ? "Komutu göster" : "Belgeyi göster"}
          </button>
        </div>
      </div>

      {komut && (
        <pre className="mt-3 max-h-48 overflow-auto rounded bg-gray-900 p-3 font-mono text-[10px] leading-relaxed text-gray-100">{komut}</pre>
      )}
      {mesaj && <div className="mt-2 rounded bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">{mesaj}</div>}
      {hata && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-[11px] text-red-800">{hata}</div>}

      <p className="mt-2 text-[11px] text-gray-500">
        Etiket, yazıcının bağlı olduğu bilgisayardan basılır; bu ayar yalnız bu bilgisayarı ilgilendirir.{" "}
        {hamYol ? (
          <>
            Yazıcının hangi dili konuştuğundan emin değilseniz <strong>Dili bul</strong> iki etiket
            gönderir — düzgün çıkanın üstünde yazan dili seçip kaydedin.
          </>
        ) : (
          <>
            Windows sürücüsü kullanılıyor. Yazıcının kendi ayarlarında kâğıt boyutunun{" "}
            <strong>{ayar.genislikMm}×{ayar.yukseklikMm} mm</strong> olduğundan emin olun; etiket kayık
            veya kırpık çıkarsa önce orayı eşitleyin, düzelmezse <strong>Ham komut</strong> yoluna geçin.
          </>
        )}
      </p>
    </fieldset>
  );
}

const Sayi = ({ etiket, value, onChange }) => (
  <label className="text-[12px]">
    <span className="mb-1 block text-gray-600">{etiket}</span>
    <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-[#c7ccd4] px-2 py-1 text-right outline-none focus:border-blue-500" />
  </label>
);
