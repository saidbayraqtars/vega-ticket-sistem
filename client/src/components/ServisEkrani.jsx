import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import Arama from "./Arama";
import EtiketOnizleme from "./EtiketOnizleme";

const CINSLER = ["Yazıcı", "Bilgisayar", "Dizüstü", "Monitör", "Tarayıcı", "Yazarkasa", "El Terminali", "Diğer"];
const DURUMLAR = [
  { kod: "KABUL", ad: "Kabul", sinif: "bg-amber-100 text-amber-900" },
  { kod: "ISLEMDE", ad: "İşlemde", sinif: "bg-blue-100 text-blue-900" },
  { kod: "HAZIR", ad: "Hazır", sinif: "bg-emerald-100 text-emerald-900" },
  { kod: "KARGODA", ad: "Kargoda", sinif: "bg-violet-100 text-violet-900" },
  { kod: "TESLIM", ad: "Teslim", sinif: "bg-gray-200 text-gray-700" },
  { kod: "IPTAL", ad: "İptal", sinif: "bg-red-100 text-red-900" },
];
const durumBilgi = (kod) => DURUMLAR.find((d) => d.kod === kod) || DURUMLAR[0];
const bosCihaz = () => ({ cins: "Yazıcı", marka: "", model: "", seriNo: "", ariza: "", aksesuar: "" });
const tarihSaat = (d) => (d ? new Date(d).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—");
const tarihTR = (d) => (d ? new Date(d).toLocaleDateString("tr-TR") : "");

export default function ServisEkrani({ firmaNo, donemNo }) {
  const [kayitlar, setKayitlar] = useState([]);
  const [seciliId, setSeciliId] = useState(null);
  const [tumu, setTumu] = useState(false);
  const [yeni, setYeni] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [mesaj, setMesaj] = useState(null);
  const [mesgul, setMesgul] = useState(false);
  const [etiketAyar, setEtiketAyar] = useState(null);

  const listeYukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const r = await api.servisListe({ firma: firmaNo, tumu: tumu ? "1" : "" });
      setKayitlar(r.kayitlar);
      setHata(null);
    } catch (err) {
      setHata(err.message);
    } finally {
      setYukleniyor(false);
    }
  }, [firmaNo, tumu]);

  useEffect(() => { listeYukle(); }, [listeYukle]);
  useEffect(() => {
    api.etiketAyar().then((r) => setEtiketAyar(r.ayar)).catch(() => setEtiketAyar(null));
  }, []);

  const secili = kayitlar.find((k) => k.ID === seciliId) || null;

  async function calistir(is, basari) {
    setMesgul(true);
    setHata(null);
    setMesaj(null);
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
    await listeYukle();
    setSeciliId(r.kayit.ID);
    // Etiket kendiliğinden basılmaz: her kayıtta kâğıt harcanmasın diye
    // baskıyı kullanıcı başlatır. Kayıt açılınca sağdaki detay paneli seçili
    // gelir, etiket düğmeleri orada.
    setMesaj(`${r.kayit.SERVISNO} açıldı. Etiket için sağdaki “Etiket bas” düğmesini kullanın.`);
  }

  const durumDegistir = (kayit, durum) =>
    calistir(async () => {
      await api.servisGuncelle(kayit.ID, { RV: kayit.RV, DURUM: durum });
      await listeYukle();
    }, `Durum ${durumBilgi(durum).ad} olarak güncellendi.`);

  const etiketBas = (govde, basari) =>
    calistir(async () => {
      await api.etiketBas(govde);
      await listeYukle();
    }, basari);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b bg-white px-3 py-2">
        <button onClick={() => { setYeni({ cari: null, yetkili: "", telefon: "", notu: "", cihazlar: [bosCihaz()] }); setHata(null); setMesaj(null); }}
          className="rounded bg-blue-600 px-4 py-1.5 text-[12px] font-semibold text-white">
          Yeni servis kabulü
        </button>
        <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
          <input type="checkbox" checked={tumu} onChange={(e) => setTumu(e.target.checked)} />
          Teslim edilenleri de göster
        </label>
        <span className="text-[12px] text-gray-500">{yukleniyor ? "yükleniyor…" : `${kayitlar.length} kayıt`}</span>
        <button onClick={listeYukle} className="ml-auto rounded border px-2 py-0.5 text-[12px]">Tazele</button>
        {etiketAyar && !etiketAyar.yazici && (
          <span className="rounded bg-amber-100 px-2 py-1 text-[11px] text-amber-900"
            title="Ayarlar ekranından etiket yazıcısını seçebilirsiniz.">
            Windows varsayılan yazıcısına basılacak
          </span>
        )}
      </div>

      {mesaj && <div className="bg-emerald-50 px-3 py-1.5 text-[12px] text-emerald-900">{mesaj}</div>}
      {hata && <div className="bg-red-50 px-3 py-1.5 text-[12px] text-red-800">{hata}</div>}

      {yeni ? (
        <YeniKabul
          firmaNo={firmaNo} donemNo={donemNo} yeni={yeni} setYeni={setYeni}
          etiketAyar={etiketAyar} mesgul={mesgul}
          onKaydet={kabulKaydet} onVazgec={() => setYeni(null)}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto border-r bg-white">
            <table className="izgara">
              <thead>
                <tr>
                  <th style={{ width: 105 }}>Servis no</th>
                  <th>Müşteri</th>
                  <th style={{ width: 70 }}>Cihaz</th>
                  <th style={{ width: 90 }}>Durum</th>
                  <th style={{ width: 130 }}>Kabul</th>
                </tr>
              </thead>
              <tbody>
                {kayitlar.map((k) => (
                  <tr key={k.ID} data-secili={k.ID === seciliId ? "1" : undefined}
                    onClick={() => setSeciliId(k.ID)} style={{ cursor: "pointer" }}>
                    <td className="font-mono">{k.SERVISNO}</td>
                    <td title={k.CARIADI}>{k.CARIADI}</td>
                    <td className="sayi">{k.cihazlar.length}</td>
                    <td><span className={`rounded px-1.5 py-0.5 text-[11px] ${durumBilgi(k.DURUM).sinif}`}>{durumBilgi(k.DURUM).ad}</span></td>
                    <td>{tarihSaat(k.KABULTARIHI)}</td>
                  </tr>
                ))}
                {!kayitlar.length && !yukleniyor && (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-500">Açık servis kaydı yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <aside className="w-[560px] shrink-0 overflow-auto bg-[#fbfcfd]">
            {secili ? (
              <ServisDetay
                kayit={secili} etiketAyar={etiketAyar} mesgul={mesgul}
                onDurum={durumDegistir} onEtiket={etiketBas}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-gray-500">
                Soldan bir servis kaydı seçin.
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function YeniKabul({ firmaNo, donemNo, yeni, setYeni, etiketAyar, mesgul, onKaydet, onVazgec }) {
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
              onSec={(k) => setYeni((o) => ({ ...o, cari: k, telefon: k.GSM || k.TELEFON1 || "", yetkili: k.YETKILI || "" }))} />
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
              <EtiketOnizleme key={i}
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
            {etiketAyar?.yazici ? `“${etiketAyar.yazici}”` : "Windows varsayılan"} yazıcısına gider.
          </p>
        </div>

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

function ServisDetay({ kayit, etiketAyar, mesgul, onDurum, onEtiket }) {
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
          {DURUMLAR.filter((d) => d.kod !== kayit.DURUM).map((d) => (
            <button key={d.kod} disabled={mesgul} onClick={() => onDurum(kayit, d.kod)}
              className="rounded border border-[#c7ccd4] px-2.5 py-1 text-[11px] disabled:opacity-40">
              {d.ad} yap
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[12px] font-semibold">Cihazlar ({kayit.cihazlar.length})</span>
        <button disabled={mesgul}
          onClick={() => onEtiket({ servisId: kayit.ID }, "Tüm etiketler yazıcıya gönderildi.")}
          className="ml-auto rounded border border-[#c7ccd4] bg-white px-3 py-1 text-[11px] disabled:opacity-40">
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

const Alan = ({ etiket, value, onChange }) => (
  <label className="text-[12px]">
    <span className="mb-1 block text-gray-600">{etiket}</span>
    <input value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-[#c7ccd4] bg-white px-2 py-1 outline-none focus:border-blue-500" />
  </label>
);
