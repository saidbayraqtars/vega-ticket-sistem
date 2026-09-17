import { useEffect, useState } from "react";
import { api } from "../api/client";
import EtiketOnizleme from "./EtiketOnizleme";
import { EtiketIsiCubugu, useEtiketIsi } from "./EtiketIsiDurumu";
import { logoluAyarHazirla, termalLogoHazirla } from "../lib/termalLogo";

const YAZI_OLCEKLERI = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.75, 2];
const sayiAl = (deger, varsayilan) => {
  const n = Number(String(deger ?? "").replace(",", "."));
  return String(deger ?? "").trim() !== "" && Number.isFinite(n) ? n : varsayilan;
};

const LISTE_TAZELEME_MS = 15000;

/**
 * Etiket yazıcısı ayarı bu bilgisayara özeldir (config.json). Etiket ya bu
 * bilgisayara bağlı yazıcıdan basılır ya da yazıcısını paylaşan başka bir
 * bilgisayarın kuyruğuna gönderilir (bkz. server/lib/etiketKuyrugu.js).
 */
export default function EtiketAyarlari() {
  const [ayar, setAyar] = useState(null);
  const [ornek, setOrnek] = useState(null);
  const [yazicilar, setYazicilar] = useState([]);
  const [mesgul, setMesgul] = useState(false);
  const [mesaj, setMesaj] = useState(null);
  const [hata, setHata] = useState(null);
  const [komut, setKomut] = useState(null);
  const [seciliOge, setSeciliOge] = useState(null);
  const [makine, setMakine] = useState("");
  const [mod, setMod] = useState("yerel");
  const [paylasilanlar, setPaylasilanlar] = useState([]);
  const [paylasimHata, setPaylasimHata] = useState(null);
  const [uzakSecili, setUzakSecili] = useState(null);
  const [denemeIsi, setDenemeIsi] = useEtiketIsi();

  useEffect(() => {
    (async () => {
      try {
        const [a, y] = await Promise.all([api.etiketAyar(), api.etiketYazicilar()]);
        setAyar(a.ayar);
        setOrnek(a.ornek);
        setMakine(a.makine || "");
        setMod(a.uzak ? "uzak" : "yerel");
        setUzakSecili(a.uzak);
        setYazicilar(y.yazicilar || []);
        if (y.mesaj) setHata(`Yazıcı listesi alınamadı: ${y.mesaj}`);
      } catch (err) {
        setHata(err.message);
      }
    })();
  }, []);

  // Etiket bilgisayarları ve çevrim içi durumları; başka bilgisayar seçiliyken tazelenir.
  useEffect(() => {
    let iptal = false;
    const yukle = () => api.etiketPaylasilanlar()
      .then((r) => { if (!iptal) { setPaylasilanlar(r.yazicilar.filter((y) => !y.buMakine)); setPaylasimHata(null); } })
      .catch((err) => { if (!iptal) setPaylasimHata(`Paylaşılan yazıcılar okunamadı: ${err.message}`); });
    yukle();
    if (mod !== "uzak") return () => { iptal = true; };
    const zamanlayici = setInterval(yukle, LISTE_TAZELEME_MS);
    return () => { iptal = true; clearInterval(zamanlayici); };
  }, [mod]);

  const hedefMakine = ayar?.hedefMakine || "";
  useEffect(() => {
    if (mod !== "uzak" || !hedefMakine) { setUzakSecili(null); return undefined; }
    let iptal = false;
    api.etiketPaylasilan(hedefMakine)
      .then((r) => !iptal && setUzakSecili(r.yazici))
      .catch(() => !iptal && setUzakSecili({ makine: hedefMakine, cevrimici: false, aktif: false, ayar: null }));
    return () => { iptal = true; };
  }, [mod, hedefMakine]);

  const degistir = (yama) => setAyar((o) => ({ ...o, ...yama }));
  const logoDegistir = (yama) => setAyar((o) => ({ ...o, logo: { ...o.logo, ...yama } }));

  async function logoSec(e) {
    const dosya = e.target.files?.[0];
    e.target.value = "";
    if (!dosya) return;
    setHata(null);
    try {
      const { resim, oran } = await termalLogoHazirla(dosya);
      setAyar((o) => {
        const etiketGen = sayiAl(o.genislikMm, 80);
        const etiketYuk = sayiAl(o.yukseklikMm, 40);
        if (o.logo) return { ...o, logo: { ...o.logo, resim } };
        // İlk logo sol üste, etiket yüksekliğine sığacak boyda; yazı sağına kayar.
        const genislikMm = Math.round(Math.min(etiketGen * 0.3, (etiketYuk - 4) / oran) * 2) / 2;
        const metinBos = String(o.metinXMm ?? "").trim() === "";
        return {
          ...o,
          logo: { resim, xMm: 2, yMm: 2, genislikMm },
          ...(metinBos ? { metinXMm: 2 + genislikMm + 1.5 } : {}),
        };
      });
      setSeciliOge("logo");
    } catch (err) {
      setHata(err.message);
    }
  }

  function onizlemedeTasi(oge, { xMm, yMm }) {
    setSeciliOge(oge);
    if (oge === "logo") logoDegistir({ xMm, yMm });
    else degistir({ metinXMm: xMm, metinYMm: yMm });
  }

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

  // Logo bitmap'i güncel genişlik ve çözünürlükle her gönderimden önce üretilir.
  const kaydet = () =>
    sarmala(async () => {
      if (mod === "uzak" && !ayar.hedefMakine) throw new Error("Etiketlerin gönderileceği bilgisayarı seçin.");
      const gonderilecek = mod === "uzak"
        ? { ...ayar, paylas: false }
        : { ...(await logoluAyarHazirla(ayar)), hedefMakine: "" };
      const r = await api.etiketAyarKaydet(gonderilecek);
      setAyar(r.ayar);
      if (r.uzak) setUzakSecili(r.uzak);
      setMesaj(mod === "uzak"
        ? `Kaydedildi. Bu bilgisayarın etiketleri ${r.ayar.hedefMakine} bilgisayarındaki yazıcıya gönderilecek.`
        : r.ayar.paylas
          ? "Kaydedildi. Bu yazıcı diğer bilgisayarlara açıldı; onlar etiket bilgisayarı olarak bu bilgisayarı seçebilir."
          : "Etiket ayarı kaydedildi.");
    });
  const uzakDene = () =>
    sarmala(async () => setDenemeIsi((await api.etiketUzakDene(ayar.hedefMakine)).is));
  const dene = () =>
    sarmala(async () => {
      const r = await api.etiketDene(await logoluAyarHazirla(ayar));
      setMesaj(`Deneme etiketi gönderildi → ${r.sonuc?.yazici || "varsayılan yazıcı"}`);
    });
  const dilDene = () =>
    sarmala(async () => setMesaj((await api.etiketDilDene(await logoluAyarHazirla(ayar))).mesaj));
  const komutGoster = () =>
    sarmala(async () => setKomut((await api.etiketOnizleme({ ayar: await logoluAyarHazirla(ayar) })).metin));

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

      <div className="mb-3 rounded border border-[#dfe3e8] bg-[#fbfcfd] p-3 text-[12px]">
        <div className="mb-1.5 font-semibold text-gray-700">Etiketler nerede basılsın?</div>
        <label className="flex items-center gap-2 py-0.5">
          <input type="radio" name="etiket-yeri" checked={mod === "yerel"} onChange={() => setMod("yerel")} />
          Bu bilgisayara bağlı yazıcıda{makine && <span className="text-gray-500">({makine})</span>}
        </label>
        {mod === "yerel" && (
          <label className="ml-6 flex items-start gap-2 py-0.5 text-gray-700">
            <input type="checkbox" className="mt-0.5" checked={Boolean(ayar.paylas)} onChange={(e) => degistir({ paylas: e.target.checked })} />
            <span>
              Bu yazıcıyı diğer bilgisayarlara aç
              <span className="block text-[11px] text-gray-500">
                Diğer bilgisayarlar etiketlerini bu bilgisayara gönderir. Program burada açık olmalı: pencere kapatılınca
                sistem tepsisinde çalışmaya devam eder ve Windows açılışında arka planda başlar.
              </span>
            </span>
          </label>
        )}
        <label className="flex items-center gap-2 py-0.5">
          <input type="radio" name="etiket-yeri" checked={mod === "uzak"} onChange={() => setMod("uzak")} />
          Başka bilgisayara bağlı yazıcıda
        </label>
        {mod === "uzak" && (
          <div className="ml-6 mt-1">
            <select value={hedefMakine} onChange={(e) => degistir({ hedefMakine: e.target.value })}
              className="w-full max-w-[520px] rounded border border-[#c7ccd4] px-2 py-1">
              <option value="">Etiket bilgisayarını seçin…</option>
              {paylasilanlar.map((y) => (
                <option key={y.makine} value={y.makine}>
                  {y.makine} — {y.yazici}{y.kullanici ? ` · ${y.kullanici}` : ""}{y.cevrimici ? "" : " (çevrim dışı)"}
                </option>
              ))}
              {hedefMakine && !paylasilanlar.some((y) => y.makine === hedefMakine) && (
                <option value={hedefMakine}>{hedefMakine} (yazıcı paylaşımı kapalı)</option>
              )}
            </select>
            {!paylasilanlar.length && !paylasimHata && (
              <div className="mt-1 text-[11px] text-amber-700">
                Yazıcısını paylaşan bilgisayar yok. Yazıcının bağlı olduğu bilgisayarda bu bölümden
                “Bu yazıcıyı diğer bilgisayarlara aç” işaretlenip kaydedilmeli.
              </div>
            )}
            {paylasimHata && <div className="mt-1 text-[11px] text-red-700">{paylasimHata}</div>}
          </div>
        )}
      </div>

      {mod === "uzak" ? (
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <div className="mb-1 text-[11px] font-semibold text-gray-600">
              Önizleme{uzakSecili?.makine ? ` — ${uzakSecili.makine} bilgisayarının etiket düzeni` : ""}
            </div>
            {uzakSecili?.ayar ? (
              <EtiketOnizleme etiket={ornek || {}} genislikMm={uzakSecili.ayar.genislikMm} yukseklikMm={uzakSecili.ayar.yukseklikMm}
                ayar={uzakSecili.ayar} olcek={4.2} />
            ) : (
              <div className="text-[11px] text-gray-500">{hedefMakine ? "Etiket düzeni okunamadı." : "Önce etiket bilgisayarını seçin."}</div>
            )}
            {uzakSecili && (
              <div className={`mt-1 max-w-[380px] text-[11px] ${uzakSecili.cevrimici ? "text-emerald-700" : "text-red-700"}`}>
                {uzakSecili.cevrimici
                  ? `Çevrim içi · yazıcı: ${uzakSecili.yazici || "—"}`
                  : "Çevrim dışı: etiket bilgisayarında program kapalı olabilir. Gönderilen etiket 10 dakika bekler, sonra iptal olur."}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={kaydet} disabled={mesgul}
              className="rounded bg-emerald-600 px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
              Kaydet
            </button>
            <button type="button" onClick={uzakDene} disabled={mesgul || !hedefMakine || denemeIsi?.sirada}
              className="rounded border border-[#c7ccd4] px-4 py-1.5 text-[12px] disabled:opacity-40">
              Deneme etiketi gönder
            </button>
          </div>
          <p className="basis-full text-[11px] text-gray-500">
            Yazıcı, ölçü, logo ve yazı yerleşimi etiket bilgisayarındaki ayardan gelir. “Etiket bas” dediğinizde etiket o
            bilgisayarın sırasına girer ve oradaki yazıcıdan çıkar.
          </p>
        </div>
      ) : (<>
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

      <div className="mt-3 rounded border border-[#dfe3e8] bg-[#fbfcfd] p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[12px] font-semibold text-gray-700">Logo ve yazı yerleşimi</span>
          <label className="ml-auto cursor-pointer rounded bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white">
            {ayar.logo ? "Logoyu değiştir…" : "Logo ekle…"}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/bmp,image/svg+xml" className="hidden" onChange={logoSec} />
          </label>
          {ayar.logo && (
            <button type="button" onClick={() => { degistir({ logo: null }); setSeciliOge(null); }}
              className="rounded border border-[#c7ccd4] px-3 py-1 text-[11px]">Logoyu kaldır</button>
          )}
        </div>
        <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2">
          {ayar.logo && (
            <>
              <Sayi etiket="Logo soldan mm" value={ayar.logo.xMm} onChange={(v) => logoDegistir({ xMm: v })} />
              <Sayi etiket="Logo üstten mm" value={ayar.logo.yMm} onChange={(v) => logoDegistir({ yMm: v })} />
              <Sayi etiket="Logo genişliği mm" value={ayar.logo.genislikMm} onChange={(v) => logoDegistir({ genislikMm: v })} />
              <div />
            </>
          )}
          <Sayi etiket="Yazı soldan mm" value={ayar.metinXMm ?? ""} yerTutucu="otomatik" onChange={(v) => degistir({ metinXMm: v })} />
          <Sayi etiket="Yazı üstten mm" value={ayar.metinYMm ?? ""} yerTutucu="otomatik" onChange={(v) => degistir({ metinYMm: v })} />
          <Sayi etiket="Yazı alanı genişliği mm" value={ayar.metinGenislikMm ?? ""} yerTutucu="otomatik" onChange={(v) => degistir({ metinGenislikMm: v })} />
          <label className="text-[12px]">
            <span className="mb-1 block text-gray-600">Yazı boyutu</span>
            <select value={sayiAl(ayar.yaziOlcek, 1)} onChange={(e) => degistir({ yaziOlcek: Number(e.target.value) })}
              className="w-full rounded border border-[#c7ccd4] px-2 py-1">
              {YAZI_OLCEKLERI.map((o) => <option key={o} value={o}>%{Math.round(o * 100)}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
          <span>Önizlemede logoyu ve yazı bloğunu fareyle sürükleyebilirsiniz. Boş bırakılan yazı konumu etiketi kenardan doldurur.</span>
          {(ayar.metinXMm != null && ayar.metinXMm !== "") || (ayar.metinYMm != null && ayar.metinYMm !== "") || (ayar.metinGenislikMm != null && ayar.metinGenislikMm !== "") ? (
            <button type="button" onClick={() => degistir({ metinXMm: null, metinYMm: null, metinGenislikMm: null })}
              className="shrink-0 text-blue-700 hover:underline">Yazıyı otomatiğe al</button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-4">
        <div>
          <div className="mb-1 text-[11px] font-semibold text-gray-600">Önizleme</div>
          <EtiketOnizleme etiket={ornek || {}} genislikMm={sayiAl(ayar.genislikMm, 80)} yukseklikMm={sayiAl(ayar.yukseklikMm, 40)}
            ayar={ayar} olcek={4.2} onTasi={onizlemedeTasi} secili={seciliOge} />
          {hamYol && ayar.logo && (
            <div className="mt-1 max-w-[340px] text-[11px] text-gray-500">
              Ham komut yolunda logo siyah-beyaz noktalara çevrilir; ince çizgiler ve açık renkler kaybolabilir.
            </div>
          )}
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

      </>)}

      <EtiketIsiCubugu is={denemeIsi} onDegisti={setDenemeIsi} onKapat={() => setDenemeIsi(null)} className="mt-2 rounded" />
      {komut && mod === "yerel" && (
        <pre className="mt-3 max-h-48 overflow-auto rounded bg-gray-900 p-3 font-mono text-[10px] leading-relaxed text-gray-100">{komut}</pre>
      )}
      {mesaj && <div className="mt-2 rounded bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">{mesaj}</div>}
      {hata && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-[11px] text-red-800">{hata}</div>}

      {mod === "yerel" && <p className="mt-2 text-[11px] text-gray-500">
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
      </p>}
    </fieldset>
  );
}

const Sayi = ({ etiket, value, onChange, yerTutucu }) => (
  <label className="text-[12px]">
    <span className="mb-1 block text-gray-600">{etiket}</span>
    <input inputMode="decimal" value={value} placeholder={yerTutucu} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-[#c7ccd4] px-2 py-1 text-right outline-none focus:border-blue-500" />
  </label>
);
