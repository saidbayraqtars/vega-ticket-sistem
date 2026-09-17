const os = require("os");
const sql = require("mssql");
const db = require("./db");
const cfg = require("./config");
const etiket = require("./etiket");
const etiketBaski = require("./etiketBaski");

/**
 * Başka bilgisayardaki etiket yazıcısına baskı. Bilgisayarlar birbirine
 * doğrudan bağlanmaz (yerel sunucu yalnız 127.0.0.1'i dinler); ortak SQL
 * Server'daki ETIKETISLERI kuyruğu kullanılır.
 *   Etiket bilgisayarı: ayarda "paylaş" açık. ETIKETYAZICILARI'na kalp atışı
 *     yazar, kendine gelen işleri UPDLOCK/READPAST ile alıp basar.
 *   İstemci: ayarda hedef bilgisayar seçili. "Etiket bas" işi kuyruğa bırakır.
 * Basım kaydı (CIHAZLAR.ETIKETBASILDI) etiket bilgisayarında, baskıdan sonra yazılır.
 */

const MAKINE = os.hostname().trim();
const DONGU_MS = 3000;
const PAYLASIM_KAPALI_MS = 10000;
const KALP_ATISI_MS = 15000;
const TEMIZLIK_MS = 60000;
// Kalp atışı KALP_ATISI_MS'de bir yazılır; üç atış kaçarsa çevrim dışı sayılır.
const CEVRIMICI_SN = 45;
// Kapalı etiket bilgisayarı saatler sonra açılınca eski etiketler basılmasın.
const IS_SURESI_DAKIKA = 10;
// Program baskı sırasında kapanırsa satır BASILIYOR kalır. Etiket çıkmış
// olabileceği için kendiliğinden tekrar basılmaz; hata olarak bildirilir.
const TAKILDI_DAKIKA = 2;
const GECMIS_GUN = 30;

const SURESI_DOLDU = `DATEADD(MINUTE, ${IS_SURESI_DAKIKA}, OLUSTURMATARIHI) <= GETDATE()`;
const SURE_HATASI = `${IS_SURESI_DAKIKA} dakika içinde basılamadı; etiket bilgisayarında program kapalı olabilir.`;
const IS_SUTUNLARI = `ID, HEDEFMAKINE, TUR, SERVISID, CIHAZIDLER, ADET, DURUM, DENEME, SONHATA,
  GONDEREN, GONDERENMAKINE, YAZICI, OLUSTURMATARIHI, BASIMTARIHI`;

const ayniMakine = (a, b) =>
  String(a || "").trim().toLocaleLowerCase("tr-TR") === String(b || "").trim().toLocaleLowerCase("tr-TR");

/** Etiketler başka bilgisayara gidecekse onun adı; bu bilgisayarda basılacaksa null. */
function uzakHedef(ayar, makine = MAKINE) {
  const hedef = String(ayar?.hedefMakine || "").trim();
  // Yazıcısını paylaşan bilgisayar kendi yazıcısına basar; kuyruk döngüsü olmasın.
  if (!hedef || ayar?.paylas || ayniMakine(hedef, makine)) return null;
  return hedef;
}

const idListesi = (deger) =>
  String(deger || "").split(",").map((x) => parseInt(x, 10)).filter((x) => Number.isInteger(x) && x > 0);

function isDisaAktar(row) {
  if (!row) return null;
  const durum = row.DURUM;
  const sirada = durum === "BEKLIYOR" || durum === "BASILIYOR";
  const hedef = row.HEDEFMAKINE;
  const etiketler = row.TUR === "DENEME" ? "Deneme etiketi" : Number(row.ADET) > 1 ? `${row.ADET} etiket` : "Etiket";
  let mesaj;
  if (durum === "BASILDI") mesaj = `${etiketler} ${hedef} bilgisayarında basıldı${row.YAZICI ? ` (${row.YAZICI})` : ""}.`;
  else if (durum === "BASILIYOR") mesaj = `${etiketler} ${hedef} bilgisayarında basılıyor…`;
  else if (durum === "BEKLIYOR") mesaj = `${etiketler} ${hedef} bilgisayarına gönderildi, sırada bekliyor…`;
  else mesaj = `${etiketler} ${hedef} bilgisayarında basılamadı: ${row.SONHATA || "bilinmeyen hata"}`;
  return {
    // mssql BIGINT'i metin döndürür; kimlikler 2^53'e ulaşmaz.
    id: Number(row.ID),
    hedefMakine: hedef,
    tur: row.TUR,
    servisId: row.SERVISID ?? null,
    adet: Number(row.ADET || 0),
    durum,
    sirada,
    basildi: durum === "BASILDI",
    hata: durum === "HATA",
    iptal: durum === "IPTAL",
    mesaj,
    yazici: row.YAZICI || null,
    gonderen: row.GONDEREN,
    olusturmaTarihi: row.OLUSTURMATARIHI,
    basimTarihi: row.BASIMTARIHI || null,
  };
}

// --- İstemci tarafı --------------------------------------------------------

async function isEkle({ hedefMakine, tur = "SERVIS", servisId = null, cihazIdler = [], gonderen }) {
  const r = await db.ticket().request()
    .input("hedef", sql.NVarChar(128), hedefMakine)
    .input("tur", sql.NVarChar(10), tur)
    .input("servis", sql.Int, servisId)
    .input("cihazlar", sql.NVarChar(600), cihazIdler.join(",") || null)
    .input("adet", sql.Int, tur === "DENEME" ? 1 : cihazIdler.length)
    .input("gonderen", sql.NVarChar(60), gonderen || "bilinmiyor")
    .input("makine", sql.NVarChar(128), MAKINE).query(`
      INSERT INTO dbo.ETIKETISLERI (HEDEFMAKINE, TUR, SERVISID, CIHAZIDLER, ADET, GONDEREN, GONDERENMAKINE)
      OUTPUT ${IS_SUTUNLARI.split(",").map((s) => `INSERTED.${s.trim()}`).join(", ")}
      VALUES (@hedef, @tur, @servis, @cihazlar, @adet, @gonderen, @makine)
    `);
  return isDisaAktar(r.recordset[0]);
}

/** Etiket bilgisayarı kapalıysa süre dolumu okuyan tarafça da işlenir (SQL Server saatiyle). */
async function isDurumu(id) {
  const r = await db.ticket().request().input("id", sql.BigInt, id).query(`
    UPDATE dbo.ETIKETISLERI SET DURUM = 'IPTAL', SONHATA = N'${SURE_HATASI}', GUNCELLEMETARIHI = GETDATE()
    WHERE ID = @id AND DURUM = 'BEKLIYOR' AND ${SURESI_DOLDU};
    SELECT ${IS_SUTUNLARI} FROM dbo.ETIKETISLERI WHERE ID = @id;
  `);
  return isDisaAktar(r.recordset[0]);
}

/** Basılamayan veya süresi dolan iş yeniden sıraya alınır; süre yeniden başlar. */
async function isTekrar(id) {
  const r = await db.ticket().request().input("id", sql.BigInt, id).query(`
    UPDATE dbo.ETIKETISLERI SET DURUM = 'BEKLIYOR', SONHATA = NULL, YAZICI = NULL,
      OLUSTURMATARIHI = GETDATE(), GUNCELLEMETARIHI = GETDATE()
    WHERE ID = @id AND DURUM IN ('HATA','IPTAL');
    SELECT @@ROWCOUNT AS DEGISEN;
    SELECT ${IS_SUTUNLARI} FROM dbo.ETIKETISLERI WHERE ID = @id;
  `);
  return { degisti: r.recordsets[0][0].DEGISEN > 0, is: isDisaAktar(r.recordsets[1][0]) };
}

/** Yazıcısını paylaşan bilgisayarlar; çevrim içi bilgisi SQL Server saatiyle hesaplanır. */
async function paylasilanlar() {
  const r = await db.ticket().request().query(`
    SELECT MAKINE, YAZICI, KULLANICI, SONHATA, SONYOKLAMA,
      CASE WHEN SONYOKLAMA > DATEADD(SECOND, -${CEVRIMICI_SN}, GETDATE()) THEN 1 ELSE 0 END AS CEVRIMICI
    FROM dbo.ETIKETYAZICILARI WHERE AKTIF = 1 ORDER BY MAKINE
  `);
  return r.recordset.map((x) => ({
    makine: x.MAKINE,
    yazici: x.YAZICI,
    kullanici: x.KULLANICI,
    cevrimici: Boolean(x.CEVRIMICI),
    sonYoklama: x.SONYOKLAMA,
    buMakine: ayniMakine(x.MAKINE, MAKINE),
  }));
}

/** Tek paylaşılan yazıcı + önizleme için yayımladığı etiket düzeni. */
async function paylasilan(makine) {
  const r = await db.ticket().request().input("makine", sql.NVarChar(128), makine).query(`
    SELECT MAKINE, YAZICI, KULLANICI, AYAR, AKTIF, SONYOKLAMA,
      CASE WHEN SONYOKLAMA > DATEADD(SECOND, -${CEVRIMICI_SN}, GETDATE()) THEN 1 ELSE 0 END AS CEVRIMICI
    FROM dbo.ETIKETYAZICILARI WHERE MAKINE = @makine
  `);
  const x = r.recordset[0];
  if (!x) return null;
  let ayar = null;
  try {
    ayar = x.AYAR ? etiket.ayarNormalize(JSON.parse(x.AYAR)) : null;
  } catch {
    /* bozuk yayın → önizleme varsayılanla */
  }
  return {
    makine: x.MAKINE, yazici: x.YAZICI, kullanici: x.KULLANICI, aktif: Boolean(x.AKTIF),
    cevrimici: Boolean(x.AKTIF && x.CEVRIMICI), sonYoklama: x.SONYOKLAMA, ayar,
  };
}

/** Paylaşım kapatılınca bu bilgisayar listeden düşer. */
async function paylasimiKapat() {
  await db.ticket().request().input("makine", sql.NVarChar(128), MAKINE)
    .query(`UPDATE dbo.ETIKETYAZICILARI SET AKTIF = 0, GUNCELLEMETARIHI = GETDATE() WHERE MAKINE = @makine`);
}

// --- Etiket bilgisayarı tarafı ---------------------------------------------

/** İstemcilerin önizlemesi için yayımlanan düzen; bitmap kalabalığı gönderilmez. */
function yayinAyari(ayar) {
  const { yazici, adet, genislikMm, yukseklikMm, metinXMm, metinYMm, metinGenislikMm, yaziOlcek, yontem, logo } = ayar;
  return JSON.stringify({
    yazici, adet, genislikMm, yukseklikMm, metinXMm, metinYMm, metinGenislikMm, yaziOlcek, yontem,
    logo: logo ? { ...logo, bitmap: null } : null,
  });
}

let sonYayin = null;
async function kalpAtisi(ayar, makine = MAKINE) {
  const yayin = yayinAyari(ayar);
  const kullanici = String(cfg.readConfig()?.kullanici || "").trim().slice(0, 60) || null;
  await db.ticket().request()
    .input("makine", sql.NVarChar(128), makine)
    .input("yazici", sql.NVarChar(200), ayar.yazici || "Windows varsayılan yazıcısı")
    .input("kullanici", sql.NVarChar(60), kullanici)
    // Logo büyük olabilir; düzen bu süreçte yazıldıktan sonra değişmedikçe
    // her atışta yeniden gönderilmez.
    .input("ayar", sql.NVarChar(sql.MAX), yayin === sonYayin ? null : yayin).query(`
      MERGE dbo.ETIKETYAZICILARI WITH (HOLDLOCK) AS H
      USING (SELECT @makine AS MAKINE) AS K ON H.MAKINE = K.MAKINE
      WHEN MATCHED THEN UPDATE SET
        YAZICI = @yazici, KULLANICI = ISNULL(@kullanici, H.KULLANICI), AYAR = ISNULL(@ayar, H.AYAR),
        AKTIF = 1, SONYOKLAMA = GETDATE(), GUNCELLEMETARIHI = GETDATE()
      WHEN NOT MATCHED THEN INSERT (MAKINE, YAZICI, KULLANICI, AYAR)
        VALUES (@makine, @yazici, @kullanici, @ayar);
    `);
  sonYayin = yayin;
}

async function siradakiIs(makine = MAKINE) {
  const r = await db.ticket().request().input("makine", sql.NVarChar(128), makine).query(`
    ;WITH Aday AS (
      SELECT TOP 1 * FROM dbo.ETIKETISLERI WITH (UPDLOCK, READPAST, ROWLOCK)
      WHERE HEDEFMAKINE = @makine AND DURUM = 'BEKLIYOR' AND NOT (${SURESI_DOLDU})
      ORDER BY ID
    )
    UPDATE Aday SET DURUM = 'BASILIYOR', DENEME = DENEME + 1, GUNCELLEMETARIHI = GETDATE()
    OUTPUT INSERTED.ID, INSERTED.TUR, INSERTED.SERVISID, INSERTED.CIHAZIDLER, INSERTED.GONDEREN, INSERTED.GONDERENMAKINE;
  `);
  return r.recordset[0] || null;
}

async function sonucYaz(id, { basildi, hata, yaziciAdi }) {
  await db.ticket().request()
    .input("id", sql.BigInt, id)
    .input("durum", sql.NVarChar(20), basildi ? "BASILDI" : "HATA")
    .input("hata", sql.NVarChar(1000), basildi ? null : String(hata || "Basılamadı.").slice(0, 1000))
    .input("yazici", sql.NVarChar(200), yaziciAdi || null).query(`
      UPDATE dbo.ETIKETISLERI SET
        DURUM = @durum, SONHATA = @hata, YAZICI = @yazici,
        BASIMTARIHI = CASE WHEN @durum = 'BASILDI' THEN GETDATE() ELSE NULL END,
        GUNCELLEMETARIHI = GETDATE()
      WHERE ID = @id AND DURUM = 'BASILIYOR'
    `);
}

/**
 * Kuyruktan alınan işi bu bilgisayarın yazıcısına basar. Modeller baskı anında
 * veritabanından okunur; istemcinin gönderdiği metin güvenilmez.
 */
async function isiBas(is, ayar, { bastir = etiketBaski.bastir, basimKaydet = etiketBaski.basimKaydet } = {}) {
  let sonuc;
  let cihazIdler = [];
  try {
    if (is.TUR === "DENEME") {
      const model = { ...etiket.ORNEK_ETIKET, servisNo: "UZAK DENEME", telefon: `${is.GONDEREN} · ${is.GONDERENMAKINE || ""}`.trim() };
      sonuc = await bastir([model], ayar, "Vega Etiket Uzak Deneme");
    } else {
      const kayitlar = await etiketBaski.modelleriTopla({ servisId: is.SERVISID, cihazIdler: idListesi(is.CIHAZIDLER) });
      if (!kayitlar.length) throw new Error("Basılacak cihaz bulunamadı; servis kaydı silinmiş olabilir.");
      cihazIdler = kayitlar.map((k) => k.cihazId);
      sonuc = await bastir(kayitlar.map((k) => k.model), ayar, `Vega Etiket ${kayitlar[0].model.servisNo}`);
    }
  } catch (err) {
    await sonucYaz(is.ID, { basildi: false, hata: err.message });
    return false;
  }
  const yaziciAdi = sonuc?.yazici || ayar.yazici || "Windows varsayılan yazıcısı";
  await sonucYaz(is.ID, { basildi: true, yaziciAdi });
  // Etiket çıktı; kayıt yazılamasa da iş "hata" sayılmaz, yoksa tekrar basılır.
  if (cihazIdler.length) {
    await basimKaydet(cihazIdler, ayar.adet).catch((err) => console.error("[Etiket kuyruğu] basım kaydı:", err.message));
  }
  return true;
}

const ucustakiler = new Set();

async function temizle(makine = MAKINE) {
  const ucusta = [...ucustakiler].map(Number).filter(Number.isInteger);
  const haric = ucusta.length ? `AND ID NOT IN (${ucusta.join(",")})` : "";
  await db.ticket().request().input("makine", sql.NVarChar(128), makine).query(`
    UPDATE dbo.ETIKETISLERI SET DURUM = 'IPTAL', SONHATA = N'${SURE_HATASI}', GUNCELLEMETARIHI = GETDATE()
    WHERE HEDEFMAKINE = @makine AND DURUM = 'BEKLIYOR' AND ${SURESI_DOLDU};

    UPDATE dbo.ETIKETISLERI SET DURUM = 'HATA', GUNCELLEMETARIHI = GETDATE(),
      SONHATA = N'Baskı yarıda kaldı (program kapanmış olabilir). Etiketi kontrol edip gerekirse tekrar gönderin.'
    WHERE HEDEFMAKINE = @makine AND DURUM = 'BASILIYOR'
      AND GUNCELLEMETARIHI < DATEADD(MINUTE, -${TAKILDI_DAKIKA}, GETDATE()) ${haric};

    DELETE FROM dbo.ETIKETISLERI
    WHERE HEDEFMAKINE = @makine AND DURUM IN ('BASILDI','HATA','IPTAL')
      AND OLUSTURMATARIHI < DATEADD(DAY, -${GECMIS_GUN}, GETDATE());
  `);
}

/**
 * Electron ana süreci bu bilgisayar etiket bilgisayarıysa pencere kapanınca
 * uygulamayı sistem tepsisinde çalışır bırakır (bkz. WhatsApp ana bilgisayarı).
 */
let sonBildirilen = null;
function durumBildir(paylas) {
  if (!process.env.VEGA_TICKET_ELECTRON || typeof process.send !== "function" || sonBildirilen === paylas) return;
  sonBildirilen = paylas;
  try {
    process.send({ tip: "etiket-ana", ana: paylas });
  } catch { /* Electron'suz çalışmada kanal yok */ }
}

let timer = null;
let aktif = false;
let calisiyor = false;
let paylasiyordu = false;
let sonKalpAtisi = 0;
let sonTemizlik = 0;

async function dongu() {
  timer = null;
  if (!aktif) return;
  if (calisiyor) return planla(DONGU_MS);
  calisiyor = true;
  let bekleme = DONGU_MS;
  try {
    // Paylaşım ayarı yerel dosyada; veritabanı beklenmeden Electron'a bildirilir.
    const ayar = etiketBaski.ayarOku();
    durumBildir(ayar.paylas);
    if (!ayar.paylas) {
      paylasiyordu = false;
      bekleme = PAYLASIM_KAPALI_MS;
      return;
    }
    if (!db.bagliMi()) {
      bekleme = 5000;
      return;
    }
    if (!paylasiyordu || Date.now() - sonKalpAtisi >= KALP_ATISI_MS) {
      await kalpAtisi(ayar);
      sonKalpAtisi = Date.now();
      paylasiyordu = true;
    }
    if (Date.now() - sonTemizlik >= TEMIZLIK_MS) {
      await temizle();
      sonTemizlik = Date.now();
    }
    const is = await siradakiIs();
    if (is) {
      ucustakiler.add(Number(is.ID));
      try {
        await isiBas(is, ayar);
      } finally {
        ucustakiler.delete(Number(is.ID));
      }
      // Arkada bekleyen iş varsa hemen sıradakine geç.
      bekleme = 100;
    }
  } catch (err) {
    console.error("[Etiket kuyruğu]", err.message);
    bekleme = 5000;
  } finally {
    calisiyor = false;
    planla(bekleme);
  }
}

function planla(ms = 0) {
  if (!aktif || timer) return;
  timer = setTimeout(dongu, ms);
  timer.unref?.();
}

function baslat() {
  aktif = true;
  planla();
}

/** Ayar değişince bekleme süresini beklemeden yeni duruma geçer. */
function uyandir() {
  sonKalpAtisi = 0;
  sonYayin = null;
  if (timer) clearTimeout(timer);
  timer = null;
  baslat();
}

function kapat() {
  aktif = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

module.exports = {
  MAKINE, CEVRIMICI_SN, IS_SURESI_DAKIKA, KALP_ATISI_MS, TAKILDI_DAKIKA,
  ayniMakine, uzakHedef, idListesi, isDisaAktar, yayinAyari,
  isEkle, isDurumu, isTekrar, paylasilanlar, paylasilan, paylasimiKapat,
  kalpAtisi, siradakiIs, isiBas, temizle,
  baslat, uyandir, kapat,
};
