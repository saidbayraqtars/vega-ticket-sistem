import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { siralaFiltrele, tarihDegeri, useTablo } from "../lib/tablo";
import { yazdir, adresEtiketiYazdir, barkodSayfasiHtml } from "../lib/yazdir";
import Arama from "./Arama";
import EtiketOnizleme from "./EtiketOnizleme";
import TabloBaslik from "./TabloBaslik";
import GonderimPenceresi from "./GonderimPenceresi";
import AdresEtiketiTasarimi from "./AdresEtiketiTasarimi";
import { EtiketIsiCubugu, useEtiketIsi } from "./EtiketIsiDurumu";
import Modal from "./Modal";
import ServisWhatsappPenceresi from "./ServisWhatsappPenceresi";
import ServisMesajSablonlari from "./ServisMesajSablonlari";
import { DURUM_MESAJ_TURU, telefonGoster, turAdi } from "../lib/servisMesaj";

const CINSLER = ["Yazıcı", "Bilgisayar", "Dizüstü", "Monitör", "Tarayıcı", "Yazarkasa", "El Terminali", "Diğer"];
/**
 * `ad` listede görünen durum, `eylem` o duruma geçiren düğme. Arızaya gönderme
 * ve kargoya verme alıcı bilgisi istediği için doğrudan değil pencereyle yapılır.
 */
const DURUMLAR = [
  { kod: "KABUL", ad: "Kabul edildi", eylem: "Kabule geri al", sinif: "bg-amber-100 text-amber-900" },
  { kod: "ISLEMDE", ad: "İşlemde", eylem: "İşleme al", sinif: "bg-blue-100 text-blue-900" },
  { kod: "HAZIR", ad: "Teslime hazır", eylem: "Teslime hazır", sinif: "bg-emerald-100 text-emerald-900" },
  { kod: "ARIZADA", ad: "Arızaya gönderildi", eylem: "Arızaya gönder…", sinif: "bg-orange-100 text-orange-900", gonderim: "ARIZA" },
  { kod: "KARGODA", ad: "Kargoya verildi", eylem: "Kargoya ver…", sinif: "bg-violet-100 text-violet-900", gonderim: "KARGO" },
  { kod: "TESLIM", ad: "Teslim edildi", eylem: "Teslim et", sinif: "bg-gray-200 text-gray-700" },
  { kod: "IPTAL", ad: "İptal edildi", eylem: "İptal et", sinif: "bg-red-100 text-red-900" },
];
const SEKMELER = [
  { grup: "acik", ad: "Serviste", durumlar: ["KABUL", "ISLEMDE", "HAZIR"] },
  { grup: "ariza", ad: "Arızaya gönderilenler", durumlar: ["ARIZADA"] },
  { grup: "kargo", ad: "Kargoya verilenler", durumlar: ["KARGODA"] },
  { grup: "teslim", ad: "Teslim edilenler", durumlar: ["TESLIM"] },
  { grup: "iptal", ad: "İptal edilenler", durumlar: ["IPTAL"] },
  { grup: "tumu", ad: "Tümü", durumlar: null },
];
const GONDERIM_TURU = { ARIZA: { ad: "Arızaya gönderim", sinif: "bg-orange-100 text-orange-900", grup: "ariza" }, KARGO: { ad: "Kargo", sinif: "bg-violet-100 text-violet-900", grup: "kargo" } };

const durumBilgi = (kod) => DURUMLAR.find((d) => d.kod === kod) || DURUMLAR[0];
const bosCihaz = () => ({ cins: "Yazıcı", marka: "", model: "", seriNo: "", ariza: "", aksesuar: "" });
const tarihSaat = (d) => (d ? new Date(d).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—");
const tarihTR = (d) => (d ? new Date(d).toLocaleDateString("tr-TR") : "");
const cihazOzeti = (k) => k.cihazlar.map((c) => [c.CINS, c.MARKA, c.MODEL].filter(Boolean).join(" ")).join(" · ");
const sonGonderim = (k) => k.gonderimler?.[0] || null;
// Tercih bu bilgisayarda hatırlanır; mesaj yine de pencerede onaylanmadan gitmez.
const KABUL_MESAJI_ANAHTARI = "vt.servisKabulWhatsapp";
const tercihOku = () => { try { return localStorage.getItem(KABUL_MESAJI_ANAHTARI) === "1"; } catch { return false; } };
const tercihYaz = (acik) => { try { localStorage.setItem(KABUL_MESAJI_ANAHTARI, acik ? "1" : "0"); } catch { /* tercih kaydedilemezse de çalışır */ } };
const WA_ROZETLERI = {
  GONDERILDI: { ad: "Gönderildi", sinif: "bg-emerald-100 text-emerald-800" },
  SIRADA: { ad: "Gönderiliyor", sinif: "bg-blue-100 text-blue-800" },
  HATA: { ad: "Gönderilemedi", sinif: "bg-red-100 text-red-800" },
  IPTAL: { ad: "İptal", sinif: "bg-gray-200 text-gray-700" },
};
const waKodu = (m) => (m.gonderildi ? "GONDERILDI" : m.sirada ? "SIRADA" : m.iptal ? "IPTAL" : "HATA");

function sutunlarOlustur(grup) {
  const sutunlar = [
    { anahtar: "SERVISNO", baslik: "Servis no", genislik: 105, hucre: (k) => <span className="font-mono">{k.SERVISNO}</span> },
    { anahtar: "CARIADI", baslik: "Müşteri", genislik: 240 },
    {
      anahtar: "cihaz", baslik: "Cihaz", genislik: 200,
      deger: (k) => cihazOzeti(k), metin: (k) => `${cihazOzeti(k)} ${k.cihazlar.map((c) => c.SERINO || "").join(" ")}`,
      hucre: (k) => `${k.cihazlar.length} · ${cihazOzeti(k)}`,
    },
    {
      anahtar: "DURUM", baslik: "Durum", genislik: 145, tip: "secim",
      secenekler: DURUMLAR.map((d) => ({ deger: d.kod, ad: d.ad })),
      hucre: (k) => <span className={`rounded px-1.5 py-0.5 text-[11px] ${durumBilgi(k.DURUM).sinif}`}>{durumBilgi(k.DURUM).ad}</span>,
    },
    { anahtar: "KABULTARIHI", baslik: "Kabul", genislik: 125, deger: (k) => tarihDegeri(k.KABULTARIHI), metin: (k) => tarihSaat(k.KABULTARIHI), hucre: (k) => tarihSaat(k.KABULTARIHI) },
  ];
  if (["ariza", "kargo", "tumu"].includes(grup)) {
    sutunlar.push(
      { anahtar: "alici", baslik: grup === "kargo" ? "Alıcı" : "Gönderilen yer", genislik: 190, deger: (k) => sonGonderim(k)?.ALICIADI || "" },
      { anahtar: "il", baslik: "İl", genislik: 110, deger: (k) => sonGonderim(k)?.ALICIIL || "" },
      { anahtar: "takip", baslik: "Kargo / takip no", genislik: 170, deger: (k) => [sonGonderim(k)?.KARGOFIRMASI, sonGonderim(k)?.TAKIPNO].filter(Boolean).join(" · ") },
      {
        anahtar: "gonderimTarihi", baslik: "Gönderim", genislik: 95,
        deger: (k) => tarihDegeri(sonGonderim(k)?.TARIH), metin: (k) => tarihTR(sonGonderim(k)?.TARIH), hucre: (k) => tarihTR(sonGonderim(k)?.TARIH),
      },
    );
  }
  return sutunlar;
}

export default function ServisEkrani({ firmaNo, donemNo }) {
  const [grup, setGrup] = useState("acik");
  const [kayitlar, setKayitlar] = useState([]);
  const [adetler, setAdetler] = useState({});
  const [seciliId, setSeciliId] = useState(null);
  const [seciliYedek, setSeciliYedek] = useState(null);
  const [yeni, setYeni] = useState(null);
  const [gonderim, setGonderim] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [mesaj, setMesaj] = useState(null);
  const [mesgul, setMesgul] = useState(false);
  const [etiketAyar, setEtiketAyar] = useState(null);
  const [etiketUzak, setEtiketUzak] = useState(null);
  const [waPencere, setWaPencere] = useState(null);
  const [oneri, setOneri] = useState(null);
  const [sablonlarAcik, setSablonlarAcik] = useState(false);
  const [tasarimAcik, setTasarimAcik] = useState(false);
  const tablo = useTablo({ sirala: "KABULTARIHI", yon: "desc" });
  const sutunlar = useMemo(() => sutunlarOlustur(grup), [grup]);

  const listeYukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const r = await api.servisListe({ firma: firmaNo, grup });
      setKayitlar(r.kayitlar);
      setAdetler(r.adetler || {});
      setHata(null);
    } catch (err) {
      setHata(err.message);
    } finally {
      setYukleniyor(false);
    }
  }, [firmaNo, grup]);

  useEffect(() => { listeYukle(); }, [listeYukle]);
  // Etiket başka bilgisayara gidiyorsa onun çevrim içi durumu başlıkta görünsün.
  useEffect(() => {
    let iptal = false;
    const yukle = () => api.etiketAyar()
      .then((r) => { if (!iptal) { setEtiketAyar(r.ayar); setEtiketUzak(r.uzak || null); } })
      .catch(() => { if (!iptal) setEtiketAyar(null); });
    yukle();
    const zamanlayici = setInterval(yukle, 30000);
    return () => { iptal = true; clearInterval(zamanlayici); };
  }, []);

  const gorunen = useMemo(() => siralaFiltrele(kayitlar, sutunlar, tablo), [kayitlar, sutunlar, tablo.sirala, tablo.yon, tablo.filtreler]);
  // Durumu değişip bu sekmeden çıkan kayıt, kullanıcı başka satır seçene kadar sağda kalır.
  const secili = kayitlar.find((k) => k.ID === seciliId) || (seciliYedek?.ID === seciliId ? seciliYedek : null);
  const siradaMesajVar = Boolean(secili?.whatsappMesajlari?.some((m) => m.sirada));

  const kayitGuncelle = useCallback((kayit) => {
    setKayitlar((liste) => liste.map((k) => (k.ID === kayit.ID ? kayit : k)));
    setSeciliYedek(kayit);
  }, []);

  // Sıradaki mesajın sonucu (gönderildi / hata) ekranda kendiliğinden görünsün.
  useEffect(() => {
    if (!siradaMesajVar || !seciliId) return undefined;
    const zamanlayici = setInterval(() => {
      api.servisDetay(seciliId).then((r) => kayitGuncelle(r.kayit)).catch(() => { /* sonraki turda denenir */ });
    }, 3000);
    return () => clearInterval(zamanlayici);
  }, [siradaMesajVar, seciliId, kayitGuncelle]);

  const sekmeAdedi = (s) => (s.durumlar ? s.durumlar : DURUMLAR.map((d) => d.kod)).reduce((t, d) => t + (adetler[d] || 0), 0);

  async function calistir(is, basari) {
    setMesgul(true);
    setHata(null);
    setMesaj(null);
    setOneri(null);
    try {
      const r = await is();
      if (basari) setMesaj(basari);
      return r;
    } catch (err) {
      setHata(err.message);
      return null;
    } finally {
      setMesgul(false);
    }
  }

  async function kabulKaydet() {
    if (!yeni?.cari) return;
    // Cins açılır listenin varsayılanı; tek başına cihaz girildiği anlamına
    // gelmez. Anlamlı satır = marka, model, seri no veya arıza dolu.
    const gonderilecek = yeni.cihazlar.filter((c) =>
      [c.marka, c.model, c.seriNo, c.ariza].some((v) => String(v ?? "").trim()));
    if (!gonderilecek.length) {
      setHata("En az bir cihaz için marka, model, seri no veya arıza bilgisi girin.");
      return;
    }
    const kabulMesajiGonder = Boolean(yeni.whatsapp);
    const r = await calistir(
      () => api.servisOlustur({
        FIRMANO: firmaNo,
        DONEMNO: donemNo,
        CARIIND: yeni.cari.IND,
        YETKILI: yeni.yetkili,
        TELEFON: yeni.telefon,
        NOTU: yeni.notu,
        cihazlar: gonderilecek.map((c) => ({
          CINS: c.cins, MARKA: c.marka, MODEL: c.model,
          SERINO: c.seriNo, ARIZA: c.ariza, AKSESUAR: c.aksesuar,
        })),
      }),
      null
    );
    if (!r) return;
    setYeni(null);
    setGrup("acik");
    await listeYukle();
    setSeciliId(r.kayit.ID);
    setSeciliYedek(r.kayit);
    // Etiket kendiliğinden basılmaz: her kayıtta kâğıt harcanmasın diye
    // baskıyı kullanıcı başlatır.
    setMesaj(`${r.kayit.SERVISNO} açıldı. Etiket için sağdaki “Etiket bas” düğmesini kullanın.`);
    setOneri({ kayit: r.kayit, tur: "KABUL" });
    if (kabulMesajiGonder) setWaPencere({ kayit: r.kayit, tur: "KABUL" });
  }

  function durumDegistir(kayit, durum) {
    if (durum.gonderim) {
      setGonderim({ kayit, tur: durum.gonderim });
      return;
    }
    calistir(async () => {
      const r = await api.servisGuncelle(kayit.ID, { RV: kayit.RV, DURUM: durum.kod });
      setSeciliYedek(r.kayit);
      await listeYukle();
      if (["HAZIR", "TESLIM"].includes(durum.kod)) setOneri({ kayit: r.kayit, tur: DURUM_MESAJ_TURU[durum.kod] });
    }, `${kayit.SERVISNO}: ${durum.ad}.`);
  }

  /** Mesaj kartındaki düzenle / tekrar gönder / iptal. */
  function waMesajIslem(m, islem, metin) {
    const basari = {
      duzenle: "WhatsApp mesajı güncellendi.",
      tekrar: "WhatsApp mesajı yeniden gönderim sırasına alındı.",
      iptal: "WhatsApp gönderimi iptal edildi.",
    }[islem];
    return calistir(async () => {
      try {
        const r = islem === "duzenle" ? await api.servisWhatsappMesajGuncelle(m.id, metin)
          : islem === "tekrar" ? await api.servisWhatsappTekrar(m.id, metin)
            : await api.servisWhatsappIptal(m.id);
        kayitGuncelle(r.kayit);
        return r;
      } catch (err) {
        // Başka biri aynı anda değiştirdiyse mesajın güncel hali gösterilsin.
        if (err.govde?.kayit) kayitGuncelle(err.govde.kayit);
        throw err;
      }
    }, basari);
  }

  // Başka bilgisayara gönderilen etiket basılınca "etiket basıldı" bilgisi listede tazelenir.
  const [etiketIsi, setEtiketIsi] = useEtiketIsi((is) => {
    if (!is.basildi) return;
    listeYukle();
    if (seciliId) api.servisDetay(seciliId).then((r) => kayitGuncelle(r.kayit)).catch(() => { /* liste zaten tazelendi */ });
  });

  const etiketBas = (govde, basari) =>
    calistir(async () => {
      const r = await api.etiketBas(govde);
      if (r.kuyruk) {
        setEtiketIsi(r.is);
        return;
      }
      await listeYukle();
      setMesaj(basari);
    });

  async function adresEtiketiBas(kayit, g) {
    setHata(null);
    try {
      const [r, t] = await Promise.all([api.servisGonderen(firmaNo), api.servisAdresTasarim()]);
      if (!r.gonderen?.ad) setMesaj("Etiketteki gönderen boş. “Arızaya gönder / Kargoya ver” penceresinden gönderen bilgisini kaydedin.");
      await adresEtiketiYazdir({ kayit, gonderim: g, gonderen: r.gonderen, tasarim: t.tasarim });
    } catch (err) {
      setHata(err.message);
    }
  }

  const barkodYazdir = (kayit) =>
    yazdir(`${kayit.SERVISNO} barkod`, barkodSayfasiHtml({ kayit })).catch((err) => setHata(err.message));

  async function takipKaydet(g, yama) {
    await calistir(async () => {
      await api.servisGonderimGuncelle(g.ID, yama);
      await listeYukle();
      const r = await api.servisDetay(g.SERVISID);
      setSeciliYedek(r.kayit);
    }, "Gönderim bilgisi güncellendi.");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b bg-white px-3 py-2">
        <button onClick={() => { setYeni({ cari: null, yetkili: "", telefon: "", notu: "", cihazlar: [bosCihaz()], whatsapp: tercihOku() }); setHata(null); setMesaj(null); setOneri(null); }}
          className="rounded bg-blue-600 px-4 py-1.5 text-[12px] font-semibold text-white">
          Yeni servis kabulü
        </button>
        <span className="text-[12px] text-gray-500">
          {yukleniyor ? "yükleniyor…" : gorunen.length === kayitlar.length ? `${kayitlar.length} kayıt` : `${gorunen.length} / ${kayitlar.length} kayıt`}
        </span>
        {tablo.filtreVar && <button onClick={tablo.filtreleriTemizle} className="text-[12px] text-blue-700 hover:underline">Filtreleri temizle</button>}
        <button onClick={() => setTasarimAcik(true)} className="ml-auto rounded border px-2 py-0.5 text-[12px]">A5 etiket tasarımı</button>
        <button onClick={() => setSablonlarAcik(true)} className="rounded border px-2 py-0.5 text-[12px]">WhatsApp şablonları</button>
        <button onClick={listeYukle} className="rounded border px-2 py-0.5 text-[12px]">Tazele</button>
        {etiketUzak ? (
          <span className={`rounded px-2 py-1 text-[11px] ${etiketUzak.cevrimici ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}
            title="Ayarlar ekranındaki “Etiket yazıcısı” bölümünden değiştirilebilir.">
            Etiketler {etiketUzak.makine} bilgisayarında basılır{etiketUzak.cevrimici ? "" : " — şu an çevrim dışı"}
          </span>
        ) : etiketAyar && !etiketAyar.yazici && (
          <span className="rounded bg-amber-100 px-2 py-1 text-[11px] text-amber-900"
            title="Ayarlar ekranından etiket yazıcısını seçebilirsiniz.">
            Windows varsayılan yazıcısına basılacak
          </span>
        )}
      </div>

      {!yeni && (
        <div className="flex flex-wrap gap-1.5 border-b bg-[#f3f5f8] px-3 py-1.5">
          {SEKMELER.map((s) => (
            <button key={s.grup} onClick={() => setGrup(s.grup)}
              className={`rounded px-3 py-1 text-[12px] ${grup === s.grup ? "bg-slate-700 font-semibold text-white" : "border border-[#c7ccd4] bg-white"}`}>
              {s.ad} <span className={grup === s.grup ? "opacity-80" : "text-gray-500"}>({sekmeAdedi(s)})</span>
            </button>
          ))}
        </div>
      )}

      {mesaj && (
        <div className="flex items-center gap-3 bg-emerald-50 px-3 py-1.5 text-[12px] text-emerald-900">
          <span>{mesaj}</span>
          {oneri && (
            <button onClick={() => setWaPencere(oneri)}
              className="rounded border border-emerald-400 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100">
              Müşteriye WhatsApp ile bildir: {turAdi(oneri.tur)}
            </button>
          )}
        </div>
      )}
      {hata && <div className="bg-red-50 px-3 py-1.5 text-[12px] text-red-800">{hata}</div>}
      <EtiketIsiCubugu is={etiketIsi} onDegisti={setEtiketIsi} onKapat={() => setEtiketIsi(null)} />

      {yeni ? (
        <YeniKabul
          firmaNo={firmaNo} donemNo={donemNo} yeni={yeni} setYeni={setYeni}
          etiketAyar={etiketUzak?.ayar || etiketAyar} etiketUzak={etiketUzak} mesgul={mesgul}
          onKaydet={kabulKaydet} onVazgec={() => setYeni(null)}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto border-r bg-white">
            <table className="izgara">
              <colgroup>{sutunlar.map((s) => <col key={s.anahtar} style={{ width: s.genislik }} />)}</colgroup>
              <TabloBaslik sutunlar={sutunlar} tablo={tablo} />
              <tbody>
                {gorunen.map((k) => (
                  <tr key={k.ID} data-secili={k.ID === seciliId ? "1" : undefined}
                    onClick={() => setSeciliId(k.ID)} style={{ cursor: "pointer" }}>
                    {sutunlar.map((s) => {
                      const icerik = s.hucre ? s.hucre(k) : s.deger ? s.deger(k) : k[s.anahtar];
                      return <td key={s.anahtar} title={typeof icerik === "string" ? icerik : undefined}>{icerik}</td>;
                    })}
                  </tr>
                ))}
                {!gorunen.length && !yukleniyor && (
                  <tr><td colSpan={sutunlar.length} className="py-8 text-center text-gray-500">
                    {kayitlar.length ? "Filtreye uyan kayıt yok." : "Bu listede kayıt yok."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <aside className="w-[560px] shrink-0 overflow-auto bg-[#fbfcfd]">
            {secili ? (
              <ServisDetay
                kayit={secili} mesgul={mesgul}
                onDurum={durumDegistir} onEtiket={etiketBas}
                onAdresEtiketi={adresEtiketiBas} onBarkod={barkodYazdir} onTakipKaydet={takipKaydet}
                onWhatsapp={(k) => setWaPencere({ kayit: k, tur: DURUM_MESAJ_TURU[k.DURUM] || "GENEL" })}
                onWaMesajIslem={waMesajIslem}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-gray-500">
                Soldan bir servis kaydı seçin.
              </div>
            )}
          </aside>
        </div>
      )}

      {gonderim && (
        <GonderimPenceresi
          kayit={gonderim.kayit} tur={gonderim.tur} firmaNo={firmaNo}
          onKapat={() => setGonderim(null)}
          onKaydedildi={(kayit, tur) => {
            setGonderim(null);
            setSeciliId(kayit.ID);
            setSeciliYedek(kayit);
            // Gönderilen kayıt kendi listesinde görünsün.
            setGrup(GONDERIM_TURU[tur].grup);
            setMesaj(`${kayit.SERVISNO}: ${tur === "ARIZA" ? "arızaya gönderildi" : "kargoya verildi"}.`);
            setOneri({ kayit, tur });
          }}
        />
      )}

      {waPencere && (
        <ServisWhatsappPenceresi
          kayit={waPencere.kayit} tur={waPencere.tur}
          onKapat={() => setWaPencere(null)}
          onGonderildi={(kayit, bilgi) => {
            setWaPencere(null);
            setOneri(null);
            setSeciliId(kayit.ID);
            kayitGuncelle(kayit);
            setHata(null);
            setMesaj(`${kayit.SERVISNO}: ${bilgi || "WhatsApp mesajı gönderim sırasına alındı."}`);
          }}
        />
      )}

      {tasarimAcik && <AdresEtiketiTasarimi firmaNo={firmaNo} onKapat={() => setTasarimAcik(false)} />}

      {sablonlarAcik && (
        <Modal baslik="Servis WhatsApp şablonları" onKapat={() => setSablonlarAcik(false)} genislik={720}>
          <div className="rounded border bg-white p-4"><ServisMesajSablonlari /></div>
        </Modal>
      )}
    </div>
  );
}

function YeniKabul({ firmaNo, donemNo, yeni, setYeni, etiketAyar, etiketUzak, mesgul, onKaydet, onVazgec }) {
  const cihazDegistir = (i, yama) =>
    setYeni((o) => ({ ...o, cihazlar: o.cihazlar.map((c, j) => (j === i ? { ...c, ...yama } : c)) }));

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 rounded border bg-white p-4">
          <div className="mb-2 text-[13px] font-semibold">1 · Müşteri</div>
          {yeni.cari ? (
            <div className="flex items-center gap-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold">{yeni.cari.AD}</div>
                <div className="font-mono text-[11px] text-gray-600">{yeni.cari.FIRMAKODU}</div>
              </div>
              <button onClick={() => setYeni((o) => ({ ...o, cari: null }))}
                className="ml-auto rounded border border-[#c7ccd4] bg-white px-3 py-1 text-[11px]">Değiştir</button>
            </div>
          ) : (
            <Arama firmaNo={firmaNo} donemNo={donemNo}
              onSec={(k) => setYeni((o) => ({ ...o, cari: k, telefon: k.TELEFON || k.GSM || k.TELEFON1 || "", yetkili: k.YETKILI || "" }))} />
          )}
          {yeni.cari && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Alan etiket="Getiren / yetkili" value={yeni.yetkili} onChange={(v) => setYeni((o) => ({ ...o, yetkili: v }))} />
              <Alan etiket="Telefon (etikete basılır)" value={yeni.telefon} onChange={(v) => setYeni((o) => ({ ...o, telefon: v }))} />
              <Alan etiket="Kabul notu" value={yeni.notu} onChange={(v) => setYeni((o) => ({ ...o, notu: v }))} />
            </div>
          )}
        </div>

        <div className="mb-4 rounded border bg-white p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[13px] font-semibold">2 · Cihazlar</span>
            <span className="text-[11px] text-gray-500">Her cihaz için ayrı etiket basılır.</span>
            <button onClick={() => setYeni((o) => ({ ...o, cihazlar: [...o.cihazlar, bosCihaz()] }))}
              className="ml-auto rounded border border-[#c7ccd4] px-3 py-1 text-[11px]">+ Cihaz ekle</button>
          </div>
          {yeni.cihazlar.map((c, i) => (
            <div key={i} className="mb-2 rounded border border-[#dfe3e8] bg-[#fbfcfd] p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-gray-200 px-2 py-0.5 text-[11px] font-semibold">{i + 1}. cihaz</span>
                {yeni.cihazlar.length > 1 && (
                  <button onClick={() => setYeni((o) => ({ ...o, cihazlar: o.cihazlar.filter((_, j) => j !== i) }))}
                    className="ml-auto text-[11px] text-red-700 underline">Kaldır</button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <label className="text-[12px]">
                  <span className="mb-1 block text-gray-600">Cins</span>
                  <select value={c.cins} onChange={(e) => cihazDegistir(i, { cins: e.target.value })}
                    className="w-full rounded border border-[#c7ccd4] px-2 py-1">
                    {CINSLER.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </label>
                <Alan etiket="Marka" value={c.marka} onChange={(v) => cihazDegistir(i, { marka: v })} />
                <Alan etiket="Model" value={c.model} onChange={(v) => cihazDegistir(i, { model: v })} />
                <Alan etiket="Seri no" value={c.seriNo} onChange={(v) => cihazDegistir(i, { seriNo: v })} />
              </div>
              <div className="mt-2 grid grid-cols-[2fr_1fr] gap-2">
                <Alan etiket="Arıza / şikâyet (etikete basılır)" value={c.ariza} onChange={(v) => cihazDegistir(i, { ariza: v })} />
                <Alan etiket="Birlikte alınanlar" value={c.aksesuar} onChange={(v) => cihazDegistir(i, { aksesuar: v })} />
              </div>
            </div>
          ))}
        </div>

        <div className="mb-4 rounded border bg-white p-4">
          <div className="mb-2 text-[13px] font-semibold">3 · Etiket önizleme</div>
          <div className="flex flex-wrap gap-3">
            {yeni.cihazlar.map((c, i) => (
              <EtiketOnizleme key={i} ayar={etiketAyar}
                genislikMm={etiketAyar?.genislikMm || 80} yukseklikMm={etiketAyar?.yukseklikMm || 40}
                etiket={{
                  servisNo: "SRV-……",
                  musteri: yeni.cari?.AD || "— müşteri seçilmedi —",
                  telefon: yeni.telefon,
                  cins: c.cins, marka: c.marka, model: c.model, seriNo: c.seriNo, ariza: c.ariza,
                  kabulTarihi: tarihTR(new Date()),
                  sira: yeni.cihazlar.length > 1 ? `${i + 1}/${yeni.cihazlar.length}` : "",
                }} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            Servis numarası kayıt açılınca oluşur. Etiket kendiliğinden basılmaz; kayıttan sonra
            açılan detayda cihaz başına veya toptan bastırırsınız. Baskı{" "}
            {etiketUzak ? `${etiketUzak.makine} bilgisayarındaki “${etiketUzak.yazici || "varsayılan"}”`
              : etiketAyar?.yazici ? `“${etiketAyar.yazici}”` : "Windows varsayılan"} yazıcısına gider.
          </p>
        </div>

        <label className="mb-3 flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
          <input type="checkbox" checked={Boolean(yeni.whatsapp)}
            onChange={(e) => { tercihYaz(e.target.checked); setYeni((o) => ({ ...o, whatsapp: e.target.checked })); }} />
          Kayıttan sonra müşteriye WhatsApp kabul mesajı gönder
          <span className="text-[11px] text-emerald-800/70">— mesaj penceresi açılır, metni görüp onaylarsınız</span>
        </label>

        <div className="flex gap-2">
          <button onClick={onKaydet} disabled={mesgul || !yeni.cari}
            className="rounded bg-emerald-600 px-5 py-2 font-semibold text-white disabled:opacity-40">
            {mesgul ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <button onClick={onVazgec} disabled={mesgul}
            className="rounded border border-[#c7ccd4] bg-white px-5 py-2 disabled:opacity-40">Vazgeç</button>
        </div>
      </div>
    </div>
  );
}

function ServisDetay({ kayit, mesgul, onDurum, onEtiket, onAdresEtiketi, onBarkod, onTakipKaydet, onWhatsapp, onWaMesajIslem }) {
  return (
    <div className="p-4">
      <div className="rounded border bg-white p-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[18px] font-bold">{kayit.SERVISNO}</span>
          <span className={`rounded px-2 py-0.5 text-[11px] ${durumBilgi(kayit.DURUM).sinif}`}>{durumBilgi(kayit.DURUM).ad}</span>
        </div>
        <div className="mt-1 text-[14px] font-semibold">{kayit.CARIADI}</div>
        <div className="text-[12px] text-gray-600">
          {kayit.TELEFON || "telefon yok"}{kayit.YETKILI ? ` · ${kayit.YETKILI}` : ""}
        </div>
        <div className="mt-1 text-[11px] text-gray-500">
          Kabul: {tarihSaat(kayit.KABULTARIHI)} · Alan: {kayit.TESLIMALAN}
          {kayit.TESLIMTARIHI ? ` · Teslim: ${tarihSaat(kayit.TESLIMTARIHI)}` : ""}
        </div>
        {kayit.NOTU && <div className="mt-2 rounded bg-gray-50 px-2 py-1.5 text-[12px]">{kayit.NOTU}</div>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {DURUMLAR.filter((d) => d.kod !== kayit.DURUM || d.gonderim).map((d) => (
            <button key={d.kod} disabled={mesgul} onClick={() => onDurum(kayit, d)}
              className={`rounded border px-2.5 py-1 text-[11px] disabled:opacity-40 ${d.gonderim ? `border-transparent font-semibold ${d.sinif}` : "border-[#c7ccd4]"}`}>
              {d.eylem}
            </button>
          ))}
        </div>
        <button disabled={mesgul} onClick={() => onWhatsapp(kayit)}
          className="mt-2 rounded bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40">
          WhatsApp mesajı gönder…
        </button>
      </div>

      {kayit.whatsappMesajlari?.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[12px] font-semibold">WhatsApp mesajları ({kayit.whatsappMesajlari.length})</div>
          {kayit.whatsappMesajlari.map((m) => (
            <WhatsappMesajKarti key={`${m.id}-${m.durum}-${m.metin}`} mesaj={m} mesgul={mesgul} onIslem={onWaMesajIslem} />
          ))}
        </div>
      )}

      {kayit.gonderimler?.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[12px] font-semibold">Gönderimler ({kayit.gonderimler.length})</div>
          {kayit.gonderimler.map((g) => (
            <GonderimKarti key={g.ID} gonderim={g} mesgul={mesgul}
              onAdresEtiketi={() => onAdresEtiketi(kayit, g)} onKaydet={(yama) => onTakipKaydet(g, yama)} />
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[12px] font-semibold">Cihazlar ({kayit.cihazlar.length})</span>
        <button disabled={mesgul} onClick={() => onBarkod(kayit)}
          className="ml-auto rounded border border-[#c7ccd4] bg-white px-3 py-1 text-[11px] disabled:opacity-40">
          Barkod çıktısı (A5)
        </button>
        <button disabled={mesgul}
          onClick={() => onEtiket({ servisId: kayit.ID }, "Tüm etiketler yazıcıya gönderildi.")}
          className="rounded border border-[#c7ccd4] bg-white px-3 py-1 text-[11px] disabled:opacity-40">
          Tüm etiketleri bas
        </button>
      </div>

      {kayit.cihazlar.map((c) => (
        <div key={c.ID} className="mt-2 rounded border bg-white p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">
                {[c.CINS, [c.MARKA, c.MODEL].filter(Boolean).join(" ")].filter(Boolean).join(": ") || "Cihaz"}
              </div>
              {c.SERINO && <div className="font-mono text-[11px] text-gray-600">S/N: {c.SERINO}</div>}
              {c.ARIZA && <div className="mt-1 text-[12px]"><span className="font-semibold">Arıza:</span> {c.ARIZA}</div>}
              {c.AKSESUAR && <div className="text-[11px] text-gray-600">Birlikte: {c.AKSESUAR}</div>}
            </div>
            <button disabled={mesgul}
              onClick={() => onEtiket({ cihazIdler: [c.ID] }, "Etiket yazıcıya gönderildi.")}
              className="ml-auto shrink-0 rounded border border-[#c7ccd4] px-2.5 py-1 text-[11px] disabled:opacity-40">
              Etiket bas
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-gray-500">
            {c.ETIKETBASILDI ? `Etiket basıldı: ${tarihSaat(c.ETIKETBASILDI)} (${c.ETIKETADEDI} adet)` : "Etiket henüz basılmadı."}
          </div>
        </div>
      ))}
    </div>
  );
}

function WhatsappMesajKarti({ mesaj: m, mesgul, onIslem }) {
  const [duzenle, setDuzenle] = useState(false);
  const [metin, setMetin] = useState(m.metin || "");
  const rozet = WA_ROZETLERI[waKodu(m)];
  // Görünen IPTAL, süresi dolmuş ama henüz kapatılmamış BEKLIYOR satırı da olabilir.
  const tekrarGonderilebilir = m.durum === "HATA" || m.durum === "IPTAL";
  const iptalEdilebilir = m.durum === "BEKLIYOR" || m.durum === "HATA";
  const duzenlenebilir = tekrarGonderilebilir || m.durum === "BEKLIYOR";

  async function islem(tur, yeniMetin) {
    if (await onIslem(m, tur, yeniMetin)) setDuzenle(false);
  }

  return (
    <div className="mt-1.5 rounded border bg-white p-3 text-[12px]">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{turAdi(m.tur)}</span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${rozet.sinif}`}>{rozet.ad}</span>
        <span className="ml-auto text-[11px] text-gray-500">{tarihSaat(m.gonderimTarihi || m.kayitTarihi)} · {m.gonderen || "—"}</span>
      </div>
      <div className="mt-1 text-[11px] text-gray-600">
        {m.telefonlar.map((t) => (
          <span key={t} className="mr-2 font-mono" title={m.gonderilenler.includes(t) ? "Bu numaraya gönderildi" : undefined}>
            {telefonGoster(t)}{m.gonderilenler.includes(t) ? " ✓" : ""}
          </span>
        ))}
      </div>
      {duzenle ? (
        <>
          <textarea value={metin} onChange={(e) => setMetin(e.target.value)} maxLength={1000} rows={4} autoFocus
            className="mt-1.5 w-full resize-y rounded border border-[#c7ccd4] px-2 py-1.5 outline-none focus:border-emerald-500" />
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {m.durum === "BEKLIYOR" && (
              <button disabled={mesgul || !metin.trim()} onClick={() => islem("duzenle", metin)}
                className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Kaydet</button>
            )}
            {tekrarGonderilebilir && (
              <button disabled={mesgul || !metin.trim()} onClick={() => islem("tekrar", metin)}
                className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Kaydet ve tekrar gönder</button>
            )}
            <button onClick={() => { setDuzenle(false); setMetin(m.metin || ""); }}
              className="rounded border border-[#c7ccd4] px-2.5 py-1 text-[11px]">Vazgeç</button>
            <span className="ml-auto text-[10px] text-gray-400">{metin.length}/1000</span>
          </div>
        </>
      ) : (
        <div className="mt-1.5 whitespace-pre-line rounded bg-gray-50 px-2 py-1.5">{m.metin}</div>
      )}
      {!m.gonderildi && !m.sirada && m.mesaj && <div className="mt-1 text-[11px] text-red-700">{m.mesaj}</div>}
      {!duzenle && (duzenlenebilir || iptalEdilebilir) && (
        <div className="mt-1.5 flex gap-3 text-[11px]">
          {duzenlenebilir && <button disabled={mesgul} onClick={() => setDuzenle(true)} className="text-blue-700 hover:underline disabled:opacity-40">düzenle</button>}
          {tekrarGonderilebilir && <button disabled={mesgul} onClick={() => islem("tekrar")} className="text-emerald-700 hover:underline disabled:opacity-40">tekrar gönder</button>}
          {iptalEdilebilir && <button disabled={mesgul} onClick={() => islem("iptal")} className="text-red-700 hover:underline disabled:opacity-40">gönderme (iptal)</button>}
        </div>
      )}
    </div>
  );
}

function GonderimKarti({ gonderim: g, mesgul, onAdresEtiketi, onKaydet }) {
  const [duzenle, setDuzenle] = useState(false);
  const [kargo, setKargo] = useState(g.KARGOFIRMASI || "");
  const [takip, setTakip] = useState(g.TAKIPNO || "");
  const tur = GONDERIM_TURU[g.TUR] || GONDERIM_TURU.KARGO;

  return (
    <div className="mt-1.5 rounded border bg-white p-3 text-[12px]">
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${tur.sinif}`}>{tur.ad}</span>
        <span className="text-[11px] text-gray-500">{tarihSaat(g.TARIH)} · {g.GONDEREN}</span>
        <button disabled={mesgul} onClick={onAdresEtiketi}
          className="ml-auto rounded border border-[#c7ccd4] px-2.5 py-1 text-[11px] disabled:opacity-40">A5 adres etiketi</button>
      </div>
      <div className="mt-1 font-semibold">{g.ALICIADI}</div>
      <div className="text-gray-600">
        {[g.ALICIYETKILI, g.ALICITELEFON].filter(Boolean).join(" · ")}
        {g.ALICIADRES && <div className="whitespace-pre-line">{g.ALICIADRES}</div>}
        {g.ALICIIL && <div className="font-semibold text-gray-800">{g.ALICIIL}</div>}
      </div>
      {duzenle ? (
        <div className="mt-2 grid grid-cols-[1fr_1fr_auto_auto] gap-1.5">
          <input value={kargo} onChange={(e) => setKargo(e.target.value)} placeholder="Kargo firması"
            className="rounded border border-[#c7ccd4] px-2 py-1 outline-none focus:border-blue-500" />
          <input value={takip} onChange={(e) => setTakip(e.target.value)} placeholder="Takip no" autoFocus
            className="rounded border border-[#c7ccd4] px-2 py-1 font-mono outline-none focus:border-blue-500" />
          <button disabled={mesgul} onClick={async () => { await onKaydet({ KARGOFIRMASI: kargo, TAKIPNO: takip }); setDuzenle(false); }}
            className="rounded bg-blue-600 px-2.5 text-[11px] font-semibold text-white disabled:opacity-40">Kaydet</button>
          <button onClick={() => setDuzenle(false)} className="rounded border border-[#c7ccd4] px-2.5 text-[11px]">Vazgeç</button>
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-2 text-[11px]">
          <span>Kargo: <strong>{g.KARGOFIRMASI || "—"}</strong></span>
          <span>Takip no: <strong className="font-mono">{g.TAKIPNO || "—"}</strong></span>
          <button onClick={() => setDuzenle(true)} className="text-blue-700 hover:underline">düzenle</button>
        </div>
      )}
      {g.NOTU && <div className="mt-1 text-[11px] text-gray-600">Not: {g.NOTU}</div>}
    </div>
  );
}

const Alan = ({ etiket, value, onChange }) => (
  <label className="text-[12px]">
    <span className="mb-1 block text-gray-600">{etiket}</span>
    <input value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-[#c7ccd4] bg-white px-2 py-1 outline-none focus:border-blue-500" />
  </label>
);
