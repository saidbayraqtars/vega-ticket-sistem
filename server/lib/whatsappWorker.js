const os = require("os");
const sql = require("mssql");
const db = require("./db");
const cfg = require("./config");
const whatsapp = require("./whatsapp");
const { SURESI_DOLDU, SURE_HATASI, telefonListesi } = require("./whatsappBildirim");

const MAKINE = os.hostname().trim();
// Kuyrukta iş varken hızlı, boştayken seyrek. Sabit 2 sn'de her tur 5 sorgu
// atıyordu (ayar + kalp atışı + 2 temizlik + kuyruk) — boşta dakikada 150
// sorgu, SQL sunucusunu ve tek iş parçacıklı Node'u boşuna meşgul ediyordu.
const DONGU_MS = 2000;
const BOSTA_MS = 15000;
// Süresi dolan mesajları kapatma temizliği her turda gerekmiyor.
const TEMIZLIK_ARALIGI_MS = 60000;
// Kalp atışı boşta BOSTA_MS'de bir yazılıyor; tazelik penceresi bunun altında
// kalırsa istemciler ana makineyi boş yere "ulaşılamıyor" gösterir.
const YOKLAMA_TAZE_MS = BOSTA_MS * 3;
// Baileys onWhatsApp + sendMessage her biri 60 sn'ye kadar bekleyebilir; bir
// mesaj üç numaraya gittiği için her numaranın ilerlemesi ayrıca yazılır ve
// GUNCELLEMETARIHI tazelenir.
// Takılan talep eşiği bunun üstünde olmalı, yoksa uçuştaki mesaj kuyruğa geri
// döner ve müşteriye ikinci kez gider.
const TAKILDI_DAKIKA = 5;
let timer = null;
let aktif = false;
let calisiyor = false;
let yerelOturumAcik = false;
let sonTemizlik = 0;
let bosTur = 0;
// Bu süreçte gönderimi süren satırlar — takılan talep temizliği bunlara dokunmaz.
const ucustakiler = new Set();

async function ayarAl() {
  if (!db.bagliMi()) return null;
  const r = await db.ticket().request().query(`
    SELECT ID, ANAMAKINE, ANAKULLANICI, BAGLI, HESAP, SONHATA, SONYOKLAMA, GUNCELLEYEN, GUNCELLEMETARIHI
    FROM dbo.WHATSAPPAYARLARI WHERE ID = 1
  `);
  return r.recordset[0] || null;
}

/** Ana bilgisayarda uygulamayı o an kullanan kişi — giriş yapınca config'e yazılır. */
const yerelKullanici = () => String(cfg.readConfig()?.kullanici || "").trim().slice(0, 60) || null;

const buMakineAna = (ayar) =>
  Boolean(ayar?.ANAMAKINE && ayar.ANAMAKINE.toLocaleLowerCase("tr-TR") === MAKINE.toLocaleLowerCase("tr-TR"));

/**
 * Electron ana süreci bu bilgisayar ana makineyse pencere kapanınca uygulamayı
 * sistem tepsisinde çalışır bırakır. HTTP yerine IPC: PIN'li kullanıcıda API
 * uçları oturum ister, ana süreç ise oturum taşımaz.
 */
let sonBildirilenAna = null;
function anaDurumuBildir(ana) {
  if (!process.env.VEGA_TICKET_ELECTRON || typeof process.send !== "function" || sonBildirilenAna === ana) return;
  sonBildirilenAna = ana;
  try {
    process.send({ tip: "whatsapp-ana", ana });
  } catch { /* Electron'suz (geliştirme) çalışmada kanal yok */ }
}

async function anaMakineYap(kullanici) {
  await db.ticket().request()
    .input("makine", sql.NVarChar(128), MAKINE)
    .input("kullanici", sql.NVarChar(60), String(kullanici || "bilinmiyor")).query(`
      MERGE dbo.WHATSAPPAYARLARI WITH (HOLDLOCK) AS H
      USING (SELECT CAST(1 AS TINYINT) AS ID) AS K ON H.ID = K.ID
      WHEN MATCHED THEN UPDATE SET
        ANAMAKINE = @makine, ANAKULLANICI = @kullanici, BAGLI = 0, HESAP = NULL, SONHATA = NULL,
        SONYOKLAMA = NULL, GUNCELLEYEN = @kullanici, GUNCELLEMETARIHI = GETDATE()
      WHEN NOT MATCHED THEN INSERT (ID, ANAMAKINE, ANAKULLANICI, GUNCELLEYEN)
        VALUES (1, @makine, @kullanici, @kullanici);
    `);
  uyandir();
  return durumAl();
}

async function kalpAtisi(durum) {
  await db.ticket().request()
    .input("makine", sql.NVarChar(128), MAKINE)
    .input("bagli", sql.Bit, Boolean(durum.hazir))
    .input("hesap", sql.NVarChar(40), durum.hesap || null)
    .input("hata", sql.NVarChar(500), durum.hata ? String(durum.hata).slice(0, 500) : null)
    .input("kullanici", sql.NVarChar(60), yerelKullanici()).query(`
      UPDATE dbo.WHATSAPPAYARLARI SET
        BAGLI = @bagli, HESAP = @hesap, SONHATA = @hata, SONYOKLAMA = GETDATE(),
        ANAKULLANICI = ISNULL(@kullanici, ANAKULLANICI)
      WHERE ID = 1 AND ANAMAKINE = @makine
    `);
}

async function eskiMesajlariKapat() {
  const ucusta = [...ucustakiler];
  const haric = ucusta.length ? `AND ID NOT IN (${ucusta.join(",")})` : "";
  await db.ticket().request().query(`
    UPDATE dbo.WHATSAPPMESAJLARI SET
      DURUM = 'IPTAL', SONHATA = '${SURE_HATASI}', GUNCELLEMETARIHI = GETDATE()
    WHERE DURUM IN ('BEKLIYOR','HATA','GONDERILIYOR')
      AND ${SURESI_DOLDU} ${haric};

    UPDATE dbo.WHATSAPPMESAJLARI SET DURUM = 'BEKLIYOR', GUNCELLEMETARIHI = GETDATE()
    WHERE DURUM = 'GONDERILIYOR'
      AND GUNCELLEMETARIHI < DATEADD(MINUTE, -${TAKILDI_DAKIKA}, GETDATE())
      AND NOT (${SURESI_DOLDU}) ${haric};
  `);
}

async function siradakiMesajiAl() {
  const r = await db.ticket().request().query(`
    ;WITH Aday AS (
      SELECT TOP 1 * FROM dbo.WHATSAPPMESAJLARI WITH (UPDLOCK, READPAST, ROWLOCK)
      WHERE DURUM = 'BEKLIYOR' AND NOT (${SURESI_DOLDU})
      ORDER BY ID
    )
    UPDATE Aday SET DURUM = 'GONDERILIYOR', DENEME = DENEME + 1, GUNCELLEMETARIHI = GETDATE()
    OUTPUT INSERTED.ID, INSERTED.TELEFON, INSERTED.TELEFONLAR, INSERTED.GONDERILENLER, INSERTED.METIN;
  `);
  return r.recordset[0] || null;
}

/** Henüz mesaj gitmemiş numaralar; yarıda kalan gönderim tekrarlanınca gidenler atlanır. */
function kalanAlicilar(mesaj) {
  const gidenler = new Set(telefonListesi(mesaj.GONDERILENLER));
  return telefonListesi(mesaj.TELEFONLAR || mesaj.TELEFON).filter((t) => !gidenler.has(t));
}

const okunurTelefon = (t) => (/^90\d{10}$/.test(t) ? `0${t.slice(2)}` : t);

async function ilerlemeKaydet(id, gonderilenler) {
  await db.ticket().request()
    .input("id", sql.BigInt, id)
    .input("gonderilenler", sql.NVarChar(100), gonderilenler.join(",")).query(`
      UPDATE dbo.WHATSAPPMESAJLARI SET GONDERILENLER = @gonderilenler, GUNCELLEMETARIHI = GETDATE()
      WHERE ID = @id AND DURUM = 'GONDERILIYOR'
    `);
}

/** Mesajı kalan her numaraya sırayla gönderir; biri başarısızsa kayıt HATA olur. */
async function mesajiGonder(mesaj, gonder = whatsapp.gonder, ilerleme = ilerlemeKaydet) {
  const toplam = telefonListesi(mesaj.TELEFONLAR || mesaj.TELEFON).length;
  if (!toplam) return { gonderildi: false, mesaj: "Caride WhatsApp'a uygun cep telefonu bulunamadı." };
  const gonderilenler = telefonListesi(mesaj.GONDERILENLER);
  const hatalar = [];
  let mesajId = null;
  for (const telefon of kalanAlicilar(mesaj)) {
    const sonuc = await gonder(telefon, mesaj.METIN);
    if (sonuc.gonderildi) {
      gonderilenler.push(telefon);
      mesajId = sonuc.mesajId || mesajId;
      await ilerleme(mesaj.ID, gonderilenler);
    } else {
      hatalar.push(`${okunurTelefon(telefon)}: ${sonuc.mesaj}`);
    }
  }
  if (!hatalar.length) return { gonderildi: true, mesajId };
  const onEk = gonderilenler.length ? `${gonderilenler.length}/${toplam} numaraya gönderildi. Gönderilemeyen: ` : "";
  return { gonderildi: false, mesajId, mesaj: onEk + hatalar.join(" · ") };
}

async function sonucuKaydet(id, sonuc) {
  await db.ticket().request()
    .input("id", sql.BigInt, id)
    .input("durum", sql.NVarChar(20), sonuc.gonderildi ? "GONDERILDI" : "HATA")
    .input("mesaj", sql.NVarChar(120), sonuc.mesajId || null)
    .input("hata", sql.NVarChar(1000), sonuc.gonderildi ? null : String(sonuc.mesaj || "Gönderilemedi.").slice(0, 1000)).query(`
      UPDATE dbo.WHATSAPPMESAJLARI SET
        DURUM = @durum, MESAJID = ISNULL(@mesaj, MESAJID), SONHATA = @hata,
        GONDERIMTARIHI = CASE WHEN @durum = 'GONDERILDI' THEN GETDATE() ELSE NULL END,
        GUNCELLEMETARIHI = GETDATE()
      WHERE ID = @id AND DURUM = 'GONDERILIYOR'
    `);
}

async function dongu() {
  timer = null;
  if (!aktif) return;
  // uyandir() uçuştaki bir turun üstüne ikinci tur açmasın.
  if (calisiyor) return planla(DONGU_MS);
  calisiyor = true;
  try {
    if (!db.bagliMi()) return planla(5000);
    const ayar = await ayarAl();
    anaDurumuBildir(buMakineAna(ayar));
    if (!buMakineAna(ayar)) {
      if (yerelOturumAcik) whatsapp.kapat();
      yerelOturumAcik = false;
      return planla(5000);
    }

    yerelOturumAcik = true;
    await whatsapp.baslat();
    const waDurum = whatsapp.durum();
    await kalpAtisi(waDurum);

    if (Date.now() - sonTemizlik >= TEMIZLIK_ARALIGI_MS) {
      await eskiMesajlariKapat();
      sonTemizlik = Date.now();
    }

    let isVardi = false;
    if (waDurum.hazir) {
      const mesaj = await siradakiMesajiAl();
      if (mesaj) {
        isVardi = true;
        ucustakiler.add(Number(mesaj.ID));
        try {
          await sonucuKaydet(mesaj.ID, await mesajiGonder(mesaj));
        } finally {
          ucustakiler.delete(Number(mesaj.ID));
        }
      }
    }
    // Yeni mesaj kuyruğa girince uyandir() zaten hızlı tura döndürüyor.
    bosTur = isVardi ? 0 : bosTur + 1;
  } catch (err) {
    console.error("[WhatsApp merkez]", err.message);
  } finally {
    calisiyor = false;
  }
  planla(bosTur >= 3 ? BOSTA_MS : DONGU_MS);
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

function uyandir() {
  // Yeni mesaj veya ayar değişti — bekleme moduysa hemen hızlı tura dön.
  bosTur = 0;
  if (timer) clearTimeout(timer);
  timer = null;
  baslat();
}

async function durumAl() {
  const ayar = await ayarAl();
  const ana = buMakineAna(ayar);
  const yerel = ana ? whatsapp.durum() : null;
  const yoklamaTaze = ayar?.SONYOKLAMA && Date.now() - new Date(ayar.SONYOKLAMA).getTime() < YOKLAMA_TAZE_MS;
  return {
    ayarli: Boolean(ayar),
    buMakine: MAKINE,
    anaMakine: ayar?.ANAMAKINE || null,
    // Oturumun açık olduğu kullanıcı: ana makinede çalışan uygulamanın kullanıcısı.
    anaKullanici: ana ? yerelKullanici() || ayar?.ANAKULLANICI || null : ayar?.ANAKULLANICI || null,
    anaYapan: ayar?.GUNCELLEYEN || null,
    buMakineAna: ana,
    hazir: ana ? Boolean(yerel?.hazir) : Boolean(ayar?.BAGLI && yoklamaTaze),
    baslatiliyor: ana ? Boolean(yerel?.baslatiliyor) : false,
    hesap: ana ? yerel?.hesap || null : ayar?.HESAP || null,
    hata: ana ? yerel?.hata || null : yoklamaTaze ? ayar?.SONHATA || null : ayar ? "Ana bilgisayara ulaşılamıyor." : null,
    qr: ana ? yerel?.qr || null : null,
    sonYoklama: ayar?.SONYOKLAMA || null,
  };
}

function kapat() {
  aktif = false;
  calisiyor = false;
  if (timer) clearTimeout(timer);
  timer = null;
  whatsapp.kapat();
}

module.exports = { MAKINE, TAKILDI_DAKIKA, kalanAlicilar, mesajiGonder, BOSTA_MS, YOKLAMA_TAZE_MS, ayarAl, buMakineAna, anaMakineYap, durumAl, baslat, uyandir, kapat };
