import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import {
  ADRES_ETIKETI_CSS, OGE_TANIMLARI, ORNEK_GONDEREN, ORNEK_GONDERIM, ORNEK_KAYIT, SAYFA,
  adresEtiketiSayfasi, logoHazirla, tasarimNormalize, varsayilanTasarim, yonDegistir,
} from "../lib/adresEtiketi";
import { adresEtiketiYazdir } from "../lib/yazdir";
import Modal from "./Modal";

const PX_MM = 96 / 25.4;
const ONIZLEME_GENISLIK_PX = 700;
const yuvarla = (n) => Math.round(n * 2) / 2;
const tarihSaat = (d) => (d ? new Date(d).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "");

/**
 * A5 adres etiketi tasarımı. Öğeler önizlemede fareyle sürüklenir veya sağdaki
 * kutulardan mm olarak girilir; seçili öğe ok tuşlarıyla 0,5 mm (Shift ile 5 mm)
 * kayar. Tasarım tüm bilgisayarlar için ortaktır.
 */
export default function AdresEtiketiTasarimi({ firmaNo, onKapat }) {
  const [tasarim, setTasarim] = useState(null);
  const [kayitli, setKayitli] = useState(null);
  const [bilgi, setBilgi] = useState(null);
  const [gonderen, setGonderen] = useState(ORNEK_GONDEREN);
  const [secili, setSecili] = useState("gonderen");
  const [mesgul, setMesgul] = useState(false);
  const [mesaj, setMesaj] = useState(null);
  const surukleme = useRef(null);

  useEffect(() => {
    api.servisAdresTasarim()
      .then((r) => {
        const t = tasarimNormalize(r.tasarim);
        setTasarim(t);
        setKayitli(JSON.stringify(t));
        setBilgi(r.guncelleyen ? { guncelleyen: r.guncelleyen, tarih: r.guncellemeTarihi } : null);
      })
      .catch((err) => {
        setTasarim(varsayilanTasarim());
        setMesaj({ hata: true, metin: `Kayıtlı tasarım okunamadı: ${err.message}` });
      });
    // Önizlemede yalnız elle kaydedilmiş gönderen görünür; Vega firma kartından
    // gelen öneri başka bir firmanın adı olabilir, o durumda örnek kullanılır.
    api.servisGonderen(firmaNo)
      .then((r) => { if (r.kaynak === "ayar" && r.gonderen?.ad) setGonderen(r.gonderen); })
      .catch(() => { /* örnek gönderenle devam */ });
  }, [firmaNo]);

  const sayfa = tasarim ? SAYFA[tasarim.yon] : SAYFA.yatay;
  const olcek = ONIZLEME_GENISLIK_PX / (SAYFA.yatay.genislik * PX_MM);
  const html = useMemo(() => (tasarim
    ? adresEtiketiSayfasi({ kayit: ORNEK_KAYIT, gonderim: ORNEK_GONDERIM, gonderen, tasarim, onizleme: true, secili })
    : ""), [tasarim, gonderen, secili]);

  if (!tasarim) {
    return <Modal baslik="A5 adres etiketi tasarımı" onKapat={onKapat} genislik={1120}><div className="text-[12px] text-gray-500">Yükleniyor…</div></Modal>;
  }

  const degisti = JSON.stringify(tasarim) !== kayitli;
  const seciliOge = tasarim.ogeler[secili];
  const seciliTanim = OGE_TANIMLARI.find((o) => o.anahtar === secili);

  function ogeGuncelle(anahtar, yama) {
    setTasarim((t) => tasarimNormalize({ ...t, ogeler: { ...t.ogeler, [anahtar]: { ...t.ogeler[anahtar], ...yama } } }));
  }

  function surukleBasla(e) {
    const hedef = e.target.closest("[data-oge]");
    if (!hedef) return;
    const anahtar = hedef.dataset.oge;
    setSecili(anahtar);
    const o = tasarim.ogeler[anahtar];
    surukleme.current = { anahtar, x0: e.clientX, y0: e.clientY, ogeX: o.x, ogeY: o.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    e.preventDefault();
  }

  function surukle(e) {
    const s = surukleme.current;
    if (!s) return;
    const mmBasinaPx = PX_MM * olcek;
    ogeGuncelle(s.anahtar, {
      x: yuvarla(s.ogeX + (e.clientX - s.x0) / mmBasinaPx),
      y: yuvarla(s.ogeY + (e.clientY - s.y0) / mmBasinaPx),
    });
  }

  function tus(e) {
    const yon = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!yon || !seciliOge) return;
    e.preventDefault();
    const adim = e.shiftKey ? 5 : 0.5;
    ogeGuncelle(secili, { x: seciliOge.x + yon[0] * adim, y: seciliOge.y + yon[1] * adim });
  }

  async function logoSec(e) {
    const dosya = e.target.files?.[0];
    e.target.value = "";
    if (!dosya) return;
    setMesaj(null);
    try {
      const logo = await logoHazirla(dosya);
      setTasarim((t) => ({ ...t, logo, ogeler: { ...t.ogeler, logo: { ...t.ogeler.logo, gorunur: true } } }));
      setSecili("logo");
    } catch (err) {
      setMesaj({ hata: true, metin: err.message });
    }
  }

  async function kaydet() {
    setMesgul(true);
    setMesaj(null);
    try {
      const r = await api.servisAdresTasarimKaydet(tasarim);
      const t = tasarimNormalize(r.tasarim);
      setTasarim(t);
      setKayitli(JSON.stringify(t));
      setBilgi({ guncelleyen: r.guncelleyen, tarih: r.guncellemeTarihi });
      setMesaj({ hata: false, metin: "Etiket tasarımı tüm bilgisayarlar için kaydedildi." });
    } catch (err) {
      setMesaj({ hata: true, metin: err.message });
    } finally {
      setMesgul(false);
    }
  }

  function kapat() {
    if (degisti && !window.confirm("Kaydedilmemiş değişiklikler var. Kapatılsın mı?")) return;
    onKapat();
  }

  const girdi = "w-full rounded border border-[#c7ccd4] px-2 py-1 text-right outline-none focus:border-blue-500";
  // Yazarken ara değer (ör. "1" → "12") sınıra kırpılmasın diye değer alandan
  // çıkınca veya Enter'da işlenir. Sürükleme değeri değiştirince kutu yenilenir.
  const sayi = (etiket, alan, adim = 0.5) => (
    <label key={alan} className="text-[11px]">
      <span className="mb-0.5 block text-gray-600">{etiket}</span>
      <input key={`${secili}-${alan}-${seciliOge[alan]}`} type="number" step={adim} defaultValue={seciliOge[alan]} className={girdi}
        onBlur={(e) => ogeGuncelle(secili, { [alan]: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") ogeGuncelle(secili, { [alan]: e.currentTarget.value }); }} />
    </label>
  );

  return (
    <Modal baslik="A5 adres etiketi tasarımı" onKapat={kapat} genislik={1120}>
      <style>{ADRES_ETIKETI_CSS}</style>
      <div className="flex gap-4">
        <div className="shrink-0">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] text-gray-600">
            <span>Öğeyi fareyle sürükleyin; seçiliyken ok tuşları 0,5 mm, Shift + ok 5 mm kaydırır.</span>
          </div>
          <div tabIndex={0} onKeyDown={tus}
            onPointerDown={surukleBasla} onPointerMove={surukle}
            onPointerUp={() => { surukleme.current = null; }} onPointerCancel={() => { surukleme.current = null; }}
            className="relative select-none overflow-hidden border border-[#b9bfc7] bg-white shadow outline-none focus:ring-2 focus:ring-blue-200"
            style={{ width: sayfa.genislik * PX_MM * olcek, height: sayfa.yukseklik * PX_MM * olcek, touchAction: "none" }}>
            <div style={{ transform: `scale(${olcek})`, transformOrigin: "0 0" }} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
          <div className="mt-1 text-[11px] text-gray-500">
            Önizlemedeki alıcı ve cihazlar örnektir. Baskıda gerçek gönderim bilgileri kullanılır.
            {bilgi?.guncelleyen && <> · Son kaydeden: <strong>{bilgi.guncelleyen}</strong> ({tarihSaat(bilgi.tarih)})</>}
          </div>
        </div>

        <div className="min-w-0 flex-1 text-[12px]">
          <div className="rounded border bg-white p-3">
            <div className="mb-1.5 font-semibold">Sayfa</div>
            <div className="flex gap-1.5">
              {[["yatay", "A5 yatay"], ["dikey", "A5 dikey"]].map(([yon, ad]) => (
                <button key={yon} type="button"
                  onClick={() => tasarim.yon !== yon && setTasarim((t) => yonDegistir(t, yon))}
                  className={`rounded px-3 py-1 text-[11px] ${tasarim.yon === yon ? "bg-slate-700 font-semibold text-white" : "border border-[#c7ccd4]"}`}>{ad}</button>
              ))}
            </div>
          </div>

          <div className="mt-2 rounded border bg-white p-3">
            <div className="mb-1.5 font-semibold">Öğeler</div>
            {OGE_TANIMLARI.map((o) => (
              <div key={o.anahtar} className={`flex items-center gap-2 rounded px-1.5 py-0.5 ${secili === o.anahtar ? "bg-blue-50" : ""}`}>
                <input type="checkbox" checked={tasarim.ogeler[o.anahtar].gorunur}
                  onChange={(e) => { ogeGuncelle(o.anahtar, { gorunur: e.target.checked }); setSecili(o.anahtar); }} />
                <button type="button" onClick={() => setSecili(o.anahtar)} className="flex-1 text-left">{o.ad}</button>
              </div>
            ))}
          </div>

          {seciliOge && (
            <div className="mt-2 rounded border bg-white p-3">
              <div className="mb-1.5 font-semibold">{seciliTanim.ad}</div>
              <div className="grid grid-cols-3 gap-2">
                {sayi("Soldan mm", "x")}
                {sayi("Üstten mm", "y")}
                {sayi("Genişlik mm", "genislik", 1)}
                {seciliOge.yazi !== undefined && sayi("Yazı pt", "yazi")}
                {seciliOge.baslikYazi !== undefined && sayi("Başlık pt", "baslikYazi")}
              </div>
              {seciliTanim.tur === "kutu" && (
                <div className="mt-2 space-y-1">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={seciliOge.cerceve} onChange={(e) => ogeGuncelle(secili, { cerceve: e.target.checked })} />
                    Çerçeve ve gölge
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={seciliOge.ustYazi} onChange={(e) => ogeGuncelle(secili, { ustYazi: e.target.checked })} />
                    Üstte “{seciliTanim.ustYazi}” yazsın
                  </label>
                </div>
              )}
              {secili === "logo" && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer rounded bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white">
                    {tasarim.logo ? "Logoyu değiştir…" : "Logo yükle…"}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={logoSec} />
                  </label>
                  {tasarim.logo && (
                    <button type="button" onClick={() => setTasarim((t) => ({ ...t, logo: null }))}
                      className="rounded border border-[#c7ccd4] px-3 py-1 text-[11px]">Logoyu kaldır</button>
                  )}
                  <span className="text-[11px] text-gray-500">PNG (saydam), JPG veya SVG. Yükseklik genişliğe göre ayarlanır.</span>
                </div>
              )}
              {secili === "gonderen" && (
                <p className="mt-2 text-[11px] text-gray-500">
                  Gönderen adı, yetkili, adres, telefon ve e-posta “Arızaya gönder / Kargoya ver” penceresindeki
                  <strong> Gönderen</strong> bölümünden düzenlenir.
                </p>
              )}
              {secili === "alici" && (
                <p className="mt-2 text-[11px] text-gray-500">Alıcı bilgileri her gönderimde pencereden girilir.</p>
              )}
            </div>
          )}

          {mesaj && <div className={`mt-2 rounded px-3 py-2 text-[11px] ${mesaj.hata ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{mesaj.metin}</div>}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={kaydet} disabled={mesgul || !degisti}
              className="rounded bg-emerald-600 px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
              {mesgul ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button type="button"
              onClick={() => adresEtiketiYazdir({ kayit: ORNEK_KAYIT, gonderim: ORNEK_GONDERIM, gonderen, tasarim })
                .catch((err) => setMesaj({ hata: true, metin: err.message }))}
              className="rounded border border-[#c7ccd4] px-4 py-1.5 text-[12px]">Örnek yazdır</button>
            <button type="button"
              onClick={() => { if (window.confirm("Konumlar varsayılana dönsün mü? Logo korunur.")) setTasarim((t) => ({ ...varsayilanTasarim(t.yon), logo: t.logo })); }}
              className="rounded border border-[#c7ccd4] px-4 py-1.5 text-[12px]">Varsayılana dön</button>
            {degisti && kayitli && (
              <button type="button" onClick={() => setTasarim(JSON.parse(kayitli))}
                className="text-[12px] text-blue-700 hover:underline">Değişiklikleri geri al</button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            Yazdırma penceresinde kâğıdı <strong>A5</strong>, kenar boşluğunu <strong>Yok</strong> ve ölçeği <strong>%100</strong> seçin.
            Yazıcı kenara çok yakın yeri basamaz; öğeleri kenardan en az 5 mm içeride tutun.
          </p>
        </div>
      </div>
    </Modal>
  );
}
