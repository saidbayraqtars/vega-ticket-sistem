import { useEffect, useState } from "react";
import { api, kullaniciAyarla } from "../api/client";
import WhatsAppAyarlari from "../components/WhatsAppAyarlari";
import EtiketAyarlari from "../components/EtiketAyarlari";

export default function Kurulum({ durum, onBitti }) {
  const [form, setForm] = useState({
    server: durum?.config?.server ?? "localhost",
    port: durum?.config?.port ?? 1433,
    instanceName: durum?.config?.instanceName ?? "",
    database: durum?.config?.database ?? "VEGADBozdemirkaya",
    ticketDatabase: durum?.config?.ticketDatabase ?? "VEGATICKETDB",
    username: durum?.config?.username ?? "sa",
    password: "",
  });
  const [mesaj, setMesaj] = useState(null);
  const [hata, setHata] = useState(null);
  const [mesgul, setMesgul] = useState(false);

  const [firmalar, setFirmalar] = useState(null);
  const [firmaNo, setFirmaNo] = useState(durum?.config?.firmaNo ?? "");
  const [donemNo, setDonemNo] = useState(durum?.config?.donemNo ?? "");
  const [kullanici, setKullanici] = useState(durum?.config?.kullanici ?? "");

  const bagli = Boolean(durum?.bagli);

  useEffect(() => {
    if (!bagli) return;
    api
      .firmalar()
      .then((r) => {
        setFirmalar(r.firmalar);
        if (!firmaNo && r.firmalar.length) {
          const ilk = r.firmalar.find((f) => f.donemler.length) ?? r.firmalar[0];
          setFirmaNo(ilk.firmaNo);
          setDonemNo(ilk.donemler[0]?.donemNo ?? "");
        }
      })
      .catch((e) => setHata(e.message));
    // firmaNo bilerek bağımlılıkta değil: ilk yüklemede varsayılan seçilsin yeter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bagli]);

  const alan = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function sar(isim, fn) {
    setMesgul(true);
    setHata(null);
    setMesaj(null);
    try {
      await fn();
    } catch (e) {
      setHata(`${isim}: ${e.message}`);
    } finally {
      setMesgul(false);
    }
  }

  const test = () =>
    sar("Bağlantı testi", async () => {
      const r = await api.kurulumTest(form);
      setMesaj(`Bağlantı başarılı — ${r.veritabani} · ${r.surum}`);
    });

  const kaydet = () =>
    sar("Kaydetme", async () => {
      await api.kurulumKaydet(form);
      setMesaj("Bağlantı kuruldu, ticket veritabanı hazırlandı.");
      onBitti({ yenidenYukle: true });
    });

  const iceAktar = () =>
    sar("İçe aktarma", async () => {
      const r = await api.kurulumIceAktar();
      setMesaj(`${r.kaynak} ayarları devralındı.`);
      setForm((f) => ({ ...f, ...r.config, password: "" }));
      onBitti({ yenidenYukle: true });
    });

  const secimiKaydet = () =>
    sar("Seçim", async () => {
      await api.secimKaydet({ firmaNo, donemNo, kullanici });
      kullaniciAyarla(kullanici);
      onBitti({ tamam: true, firmaNo, donemNo, kullanici });
    });

  const secilenFirma = firmalar?.find((f) => f.firmaNo === firmaNo);

  return (
    <div className="mx-auto max-w-[720px] p-6">
      <h1 className="mb-1 text-[20px] font-semibold">Vega Ticket Sistem — Kurulum</h1>
      <p className="mb-5 text-[12px] text-gray-600">
        Vega veritabanı <strong>sadece okunur</strong>. Ticketlar ayrı bir veritabanında tutulur ve
        ilk bağlantıda otomatik oluşturulur.
      </p>

      {durum?.iceAktarilabilir && !bagli && (
        <div className="mb-4 flex items-center gap-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-[12px]">
          <span className="flex-1">
            <strong>{durum.iceAktarilabilir.kaynak}</strong> uygulamasının kayıtlı bağlantısı bulundu (
            {durum.iceAktarilabilir.server} / {durum.iceAktarilabilir.username}). Parolayı yeniden
            yazmadan devralabilirsiniz.
          </span>
          <button
            onClick={iceAktar}
            disabled={mesgul}
            className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-40"
          >
            Devral
          </button>
        </div>
      )}

      <fieldset className="mb-5 rounded border border-[#dfe3e8] bg-white p-4">
        <legend className="px-1 text-[12px] font-semibold text-gray-600">SQL Server bağlantısı</legend>
        <div className="grid grid-cols-2 gap-3">
          <Alan etiket="Sunucu" value={form.server} onChange={alan("server")} />
          <Alan etiket="Port" value={form.port} onChange={alan("port")} />
          <Alan
            etiket="Named instance (varsa)"
            value={form.instanceName}
            onChange={alan("instanceName")}
            ipucu="Doluysa port yok sayılır"
          />
          <Alan etiket="Vega veritabanı" value={form.database} onChange={alan("database")} />
          <Alan
            etiket="Ticket veritabanı"
            value={form.ticketDatabase}
            onChange={alan("ticketDatabase")}
            ipucu="Yoksa oluşturulur"
          />
          <Alan etiket="Kullanıcı" value={form.username} onChange={alan("username")} />
          <Alan
            etiket="Parola"
            type="password"
            value={form.password}
            onChange={alan("password")}
            ipucu={durum?.config?.parolaKayitli ? "Boş bırakılırsa kayıtlı parola kullanılır" : undefined}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={test} disabled={mesgul} className="rounded border border-[#c7ccd4] px-3 py-1">
            Bağlantıyı test et
          </button>
          <button
            onClick={kaydet}
            disabled={mesgul}
            className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-40"
          >
            Kaydet ve bağlan
          </button>
        </div>
      </fieldset>

      {bagli && (
        <>
          <fieldset className="mb-5 rounded border border-[#dfe3e8] bg-white p-4">
            <legend className="px-1 text-[12px] font-semibold text-gray-600">Firma, dönem ve kullanıcı</legend>
            {!firmalar ? (
              <div className="text-[12px] text-gray-500">Firmalar yükleniyor…</div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
              <label className="text-[12px]">
                <span className="mb-1 block text-gray-600">Firma</span>
                <select
                  className="w-full rounded border border-[#c7ccd4] px-2 py-1"
                  value={firmaNo}
                  onChange={(e) => {
                    const f = firmalar.find((x) => x.firmaNo === e.target.value);
                    setFirmaNo(e.target.value);
                    setDonemNo(f?.donemler[0]?.donemNo ?? "");
                  }}
                >
                  {firmalar.map((f) => (
                    <option key={f.firmaNo} value={f.firmaNo}>
                      {f.firmaNo} — {f.kisaAd || f.unvan || "(adsız)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px]">
                <span className="mb-1 block text-gray-600">Dönem</span>
                <select
                  className="w-full rounded border border-[#c7ccd4] px-2 py-1"
                  value={donemNo}
                  onChange={(e) => setDonemNo(e.target.value)}
                >
                  {(secilenFirma?.donemler ?? []).map((d) => (
                    <option key={d.donemNo} value={d.donemNo}>
                      {d.yil} ({d.donemNo})
                    </option>
                  ))}
                </select>
              </label>
              <Alan
                etiket="Adınız"
                value={kullanici}
                onChange={(e) => setKullanici(e.target.value)}
                ipucu="Ticketlarda kim yaptı bilgisi"
              />
              </div>
            )}
            <div className="mt-3">
              <button
                onClick={secimiKaydet}
                disabled={mesgul || !firmaNo || !donemNo || !kullanici.trim()}
                className="rounded bg-emerald-600 px-4 py-1 text-white disabled:opacity-40"
              >
                Devam et
              </button>
            </div>
          </fieldset>
          <WhatsAppAyarlari />
          <EtiketAyarlari />
        </>
      )}

      {mesaj && <div className="rounded bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">{mesaj}</div>}
      {hata && <div className="rounded bg-red-50 px-3 py-2 text-[12px] text-red-800">{hata}</div>}
    </div>
  );
}

const Alan = ({ etiket, ipucu, ...p }) => (
  <label className="text-[12px]">
    <span className="mb-1 block text-gray-600">{etiket}</span>
    <input className="w-full rounded border border-[#c7ccd4] px-2 py-1 outline-none focus:border-blue-500" {...p} />
    {ipucu && <span className="mt-0.5 block text-[11px] text-gray-400">{ipucu}</span>}
  </label>
);
