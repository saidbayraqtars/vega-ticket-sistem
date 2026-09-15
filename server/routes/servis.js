const express = require("express");
const sql = require("mssql");
const db = require("../lib/db");
const vega = require("../lib/vega");
const cariCache = require("../lib/cariCache");
const { cariTelefonu } = require("../lib/telefon");
const { rvCevir } = require("../lib/ticketKurallari");

const router = express.Router();

const DURUMLAR = db.SERVIS_DURUMLARI;
/**
 * Liste sekmeleri. Üreticiye/yetkili servise arızaya gönderilen cihaz ile
 * müşteriye kargoya verilen cihaz ayrı izlenir; ikisi eskiden tek KARGODA
 * durumundaydı.
 */
const GRUPLAR = {
  acik: ["KABUL", "ISLEMDE", "HAZIR"],
  ariza: ["ARIZADA"],
  kargo: ["KARGODA"],
  teslim: ["TESLIM"],
  iptal: ["IPTAL"],
};
/** Gönderim türü → kayıt durumu. */
const GONDERIM_DURUMU = { ARIZA: "ARIZADA", KARGO: "KARGODA" };
const GONDEREN_ANAHTARI = "ADRES_ETIKETI_GONDEREN";

const SERVIS_SUTUNLARI = `ID, SERVISNO, FIRMANO, DONEMNO, CARIIND, CARIKODU, CARIADI, TELEFON,
  YETKILI, DURUM, NOTU, KABULTARIHI, TESLIMTARIHI, TESLIMALAN,
  GUNCELLEYEN, GUNCELLEMETARIHI, SILINDI, RV`;
const CIHAZ_SUTUNLARI = `ID, SERVISID, SIRA, CINS, MARKA, MODEL, SERINO, ARIZA, AKSESUAR,
  DURUM, YAPILANISLEM, ETIKETBASILDI, ETIKETADEDI, RV`;
const GONDERIM_SUTUNLARI = `ID, SERVISID, TUR, ALICIADI, ALICIYETKILI, ALICITELEFON, ALICIADRES,
  ALICIIL, KARGOFIRMASI, TAKIPNO, NOTU, GONDEREN, TARIH`;
const cikti = (sutunlar) => sutunlar.split(",").map((s) => "INSERTED." + s.trim()).join(", ");

const rvHex = (buf) => (buf ? Buffer.from(buf).toString("hex") : null);
const disaAktar = (r) => ({ ...r, RV: rvHex(r.RV) });
const kirp = (deger, uzunluk) => {
  const metin = String(deger ?? "").trim();
  return metin ? metin.slice(0, uzunluk) : null;
};
const gecerliId = (deger) => {
  const id = parseInt(deger, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * Gövdeden gelen cihaz satırını doğrular; anlamsız satır atlanır.
 * CINS açılır listenin varsayılanı olduğu için tek başına cihaz sayılmaz —
 * en az marka, model, seri no veya arıza dolu olmalı.
 */
function cihazNormalize(ham) {
  const cihaz = {
    cins: kirp(ham?.CINS ?? ham?.cins, 40),
    marka: kirp(ham?.MARKA ?? ham?.marka, 60),
    model: kirp(ham?.MODEL ?? ham?.model, 60),
    seriNo: kirp(ham?.SERINO ?? ham?.seriNo, 60),
    ariza: kirp(ham?.ARIZA ?? ham?.ariza, 400),
    aksesuar: kirp(ham?.AKSESUAR ?? ham?.aksesuar, 200),
  };
  const dolu = [cihaz.marka, cihaz.model, cihaz.seriNo, cihaz.ariza].some(Boolean);
  return dolu ? cihaz : null;
}

/** Gönderim alanları: [kolon, parametre, tip, uzunluk]. */
const GONDERIM_ALANLARI = [
  ["ALICIADI", "aliciadi", sql.NVarChar(200), 200],
  ["ALICIYETKILI", "aliciyetkili", sql.NVarChar(100), 100],
  ["ALICITELEFON", "alicitelefon", sql.NVarChar(40), 40],
  ["ALICIADRES", "aliciadres", sql.NVarChar(600), 600],
  ["ALICIIL", "aliciil", sql.NVarChar(100), 100],
  ["KARGOFIRMASI", "kargofirmasi", sql.NVarChar(60), 60],
  ["TAKIPNO", "takipno", sql.NVarChar(60), 60],
  ["NOTU", "gnotu", sql.NVarChar(400), 400],
];

/** Yeni gönderim gövdesini doğrular. */
function gonderimNormalize(b) {
  const tur = String(b?.TUR || "").toUpperCase();
  if (!Object.hasOwn(GONDERIM_DURUMU, tur)) return { hata: "Gönderim türü ARIZA veya KARGO olmalı." };
  const alanlar = Object.fromEntries(GONDERIM_ALANLARI.map(([kolon, , , uzunluk]) => [kolon, kirp(b?.[kolon], uzunluk)]));
  if (!alanlar.ALICIADI) return { hata: "Alıcı adı zorunlu." };
  return { tur, alanlar };
}

function idListesi(istek, onEk, idler) {
  return idler
    .map((id, i) => {
      istek.input(`${onEk}${i}`, sql.Int, id);
      return `@${onEk}${i}`;
    })
    .join(",");
}

async function gruplayarakAl(tablo, sutunlar, siralama, servisIdler) {
  const harita = new Map();
  if (!servisIdler.length) return harita;
  const istek = db.ticket().request();
  const r = await istek.query(`
    SELECT ${sutunlar} FROM dbo.${tablo}
    WHERE SERVISID IN (${idListesi(istek, "s", servisIdler)}) ORDER BY ${siralama}
  `);
  for (const satir of r.recordset) {
    if (!harita.has(satir.SERVISID)) harita.set(satir.SERVISID, []);
    harita.get(satir.SERVISID).push(satir.RV === undefined ? satir : disaAktar(satir));
  }
  return harita;
}

/** Kayıtlara cihazları ve gönderim geçmişini (en yeni başta) ekler. */
async function ayrintiEkle(kayitlar) {
  const idler = kayitlar.map((k) => k.ID);
  const [cihazlar, gonderimler] = await Promise.all([
    gruplayarakAl("CIHAZLAR", CIHAZ_SUTUNLARI, "SERVISID, SIRA, ID", idler),
    gruplayarakAl("SERVISGONDERIMLERI", GONDERIM_SUTUNLARI, "SERVISID, TARIH DESC, ID DESC", idler),
  ]);
  return kayitlar.map((k) => ({ ...k, cihazlar: cihazlar.get(k.ID) || [], gonderimler: gonderimler.get(k.ID) || [] }));
}

async function tekKayit(id) {
  const r = await db.ticket().request().input("id", sql.Int, id)
    .query(`SELECT ${SERVIS_SUTUNLARI} FROM dbo.SERVISKAYITLARI WHERE ID = @id AND SILINDI = 0`);
  if (!r.recordset.length) return null;
  return (await ayrintiEkle([disaAktar(r.recordset[0])]))[0];
}

/** Vega kart tablosunda gerçekten olan kolonlar — sürümden sürüme değişebiliyor. */
const kolonBellek = new Map();
async function mevcutKolonlar(pool, tablo, adaylar) {
  if (!kolonBellek.has(tablo)) {
    const r = await pool.request().input("t", sql.NVarChar, tablo)
      .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t`);
    kolonBellek.set(tablo, new Set(r.recordset.map((x) => String(x.COLUMN_NAME).toUpperCase())));
  }
  const varOlan = kolonBellek.get(tablo);
  return adaylar.filter((k) => varOlan.has(k));
}

const metinAl = (satir, kolon) => String(satir?.[kolon] ?? "").replace(/\r\n?/g, "\n").trim();
const benzersizBirlestir = (parcalar, ayrac) =>
  [...new Set(parcalar.map((x) => String(x || "").trim()).filter(Boolean))].join(ayrac);

/** GET /api/servis — sekmeye göre liste + tüm sekmelerin adetleri. */
router.get("/", async (req, res, next) => {
  try {
    const firmaNo = vega.pad4(req.query.firma);
    const limit = Math.min(parseInt(req.query.limit, 10) || 300, 1000);
    const kosullar = ["SILINDI = 0", "FIRMANO = @firma"];
    const istek = db.ticket().request().input("firma", sql.NVarChar(4), firmaNo);

    let durumlar = null;
    if (req.query.durum) {
      const durum = String(req.query.durum).toUpperCase();
      if (!DURUMLAR.includes(durum)) return res.status(400).json({ ok: false, mesaj: "Geçersiz durum." });
      durumlar = [durum];
    } else if (req.query.tumu !== "1" && req.query.grup !== "tumu") {
      const grup = String(req.query.grup || "acik");
      if (!Object.hasOwn(GRUPLAR, grup)) return res.status(400).json({ ok: false, mesaj: "Geçersiz liste." });
      durumlar = GRUPLAR[grup];
    }
    // Değerler sabit beyaz listeden geliyor; kullanıcı girdisi sorguya girmez.
    if (durumlar) kosullar.push(`DURUM IN (${durumlar.map((d) => `'${d}'`).join(",")})`);
    if (req.query.cari) {
      const cari = gecerliId(req.query.cari);
      if (!cari) return res.status(400).json({ ok: false, mesaj: "Geçersiz cari." });
      kosullar.push("CARIIND = @cari");
      istek.input("cari", sql.Int, cari);
    }

    const [r, adetler] = await Promise.all([
      istek.query(`
        SELECT TOP ${limit} ${SERVIS_SUTUNLARI} FROM dbo.SERVISKAYITLARI
        WHERE ${kosullar.join(" AND ")}
        ORDER BY KABULTARIHI DESC, ID DESC
      `),
      db.ticket().request().input("firma", sql.NVarChar(4), firmaNo).query(`
        SELECT DURUM, COUNT(*) AS ADET FROM dbo.SERVISKAYITLARI
        WHERE SILINDI = 0 AND FIRMANO = @firma GROUP BY DURUM
      `),
    ]);
    res.json({
      ok: true,
      kayitlar: await ayrintiEkle(r.recordset.map(disaAktar)),
      adetler: Object.fromEntries(adetler.recordset.map((x) => [x.DURUM, x.ADET])),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/servis/gonderim/adresler?tur=ARIZA — daha önce gönderilen alıcılar. */
router.get("/gonderim/adresler", async (req, res, next) => {
  try {
    const tur = String(req.query.tur || "ARIZA").toUpperCase();
    if (!Object.hasOwn(GONDERIM_DURUMU, tur)) return res.status(400).json({ ok: false, mesaj: "Geçersiz gönderim türü." });
    const r = await db.ticket().request().input("tur", sql.NVarChar(10), tur).query(`
      SELECT TOP 40 ALICIADI, ALICIYETKILI, ALICITELEFON, ALICIADRES, ALICIIL, KARGOFIRMASI,
        MAX(TARIH) AS SONTARIH, COUNT(*) AS ADET
      FROM dbo.SERVISGONDERIMLERI WHERE TUR = @tur
      GROUP BY ALICIADI, ALICIYETKILI, ALICITELEFON, ALICIADRES, ALICIIL, KARGOFIRMASI
      ORDER BY SONTARIH DESC
    `);
    res.json({ ok: true, adresler: r.recordset });
  } catch (err) {
    next(err);
  }
});

/** GET /api/servis/gonderen — adres etiketindeki gönderen (ortak ayar). */
router.get("/gonderen", async (req, res, next) => {
  try {
    const r = await db.ticket().request().input("a", sql.NVarChar(60), GONDEREN_ANAHTARI)
      .query(`SELECT DEGER, GUNCELLEYEN, GUNCELLEMETARIHI FROM dbo.ORTAKAYARLAR WHERE ANAHTAR = @a`);
    const kayit = r.recordset[0];
    if (kayit?.DEGER) {
      try {
        return res.json({ ok: true, kaynak: "ayar", gonderen: JSON.parse(kayit.DEGER), guncelleyen: kayit.GUNCELLEYEN });
      } catch {
        /* bozuk ayar → Vega firma bilgisine düş */
      }
    }
    res.json({ ok: true, kaynak: "vega", gonderen: await vegaFirmaBilgisi(req.query.firma) });
  } catch (err) {
    next(err);
  }
});

router.post("/gonderen", async (req, res, next) => {
  try {
    const gonderen = {
      ad: kirp(req.body?.ad, 200),
      adres: kirp(req.body?.adres, 600),
      il: kirp(req.body?.il, 100),
      telefon: kirp(req.body?.telefon, 40),
    };
    if (!gonderen.ad) return res.status(400).json({ ok: false, mesaj: "Gönderen adı zorunlu." });
    const kullanici = String(req.kullanici || "").trim() || "bilinmiyor";
    await db.ticket().request()
      .input("a", sql.NVarChar(60), GONDEREN_ANAHTARI)
      .input("d", sql.NVarChar(sql.MAX), JSON.stringify(gonderen))
      .input("k", sql.NVarChar(60), kullanici).query(`
        MERGE dbo.ORTAKAYARLAR WITH (HOLDLOCK) AS H
        USING (SELECT @a AS ANAHTAR) AS K ON H.ANAHTAR = K.ANAHTAR
        WHEN MATCHED THEN UPDATE SET DEGER = @d, GUNCELLEYEN = @k, GUNCELLEMETARIHI = GETDATE()
        WHEN NOT MATCHED THEN INSERT (ANAHTAR, DEGER, GUNCELLEYEN) VALUES (@a, @d, @k);
      `);
    res.json({ ok: true, gonderen });
  } catch (err) {
    next(err);
  }
});

/** Ayar yoksa gönderen, Vega firma kartından (TBLFIRMA) önerilir. */
async function vegaFirmaBilgisi(firma) {
  const bos = { ad: "", adres: "", il: "", telefon: "" };
  const ind = parseInt(firma, 10);
  if (!db.vega() || !Number.isInteger(ind)) return bos;
  try {
    const r = await db.vega().request().input("ind", sql.Int, ind).query(`SELECT * FROM TBLFIRMA WHERE IND = @ind`);
    const f = r.recordset[0];
    if (!f) return bos;
    const al = (k) => (typeof f[k] === "string" ? f[k].trim() : "");
    return {
      ad: al("AD1") || al("KISAAD"),
      adres: [al("MAHALLE"), al("CADDE"), al("SOKAK"), al("APARTMANADI"),
        al("APARTMANNO") && `No: ${al("APARTMANNO")}`, al("DAIRE") && `D: ${al("DAIRE")}`].filter(Boolean).join(" "),
      il: benzersizBirlestir([al("ILCE"), al("SEHIR"), al("IL")], " / "),
      telefon: al("TELEFON1") || al("TELEFON") || al("TEL1"),
    };
  } catch {
    return bos;
  }
}

/** GET /api/servis/:id — kabul kaydı + cihazları + gönderimleri */
router.get("/:id", async (req, res, next) => {
  try {
    const id = gecerliId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const kayit = await tekKayit(id);
    if (!kayit) return res.status(404).json({ ok: false, mesaj: "Servis kaydı bulunamadı." });
    res.json({ ok: true, kayit });
  } catch (err) {
    next(err);
  }
});

/** GET /api/servis/:id/musteri-adres — kargo etiketi için Vega'daki müşteri adresi (salt okunur). */
router.get("/:id/musteri-adres", async (req, res, next) => {
  try {
    const id = gecerliId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const k = await db.ticket().request().input("id", sql.Int, id).query(`
      SELECT FIRMANO, CARIIND, CARIADI, TELEFON, YETKILI FROM dbo.SERVISKAYITLARI WHERE ID = @id AND SILINDI = 0
    `);
    const kayit = k.recordset[0];
    if (!kayit) return res.status(404).json({ ok: false, mesaj: "Servis kaydı bulunamadı." });

    const adres = { ALICIADI: kayit.CARIADI || "", ALICIYETKILI: kayit.YETKILI || "", ALICITELEFON: kayit.TELEFON || "", ALICIADRES: "", ALICIIL: "" };
    const pool = db.vega();
    const tablo = vega.kartTablosu(kayit.FIRMANO, "CARI");
    await vega.tabloDogrula(pool, tablo);
    const kolonlar = await mevcutKolonlar(pool, tablo,
      ["ADRESSEVK", "ADRESFATURA", "ADRESPOSTA", "IL", "SEHIR", "POSTAKODU", "YETKILI", "YGSM", "TELEFON1"]);
    if (kolonlar.length) {
      // ADRES* kolonları ntext; LTRIM ntext kabul etmediği için önce çevrilir.
      const secim = kolonlar.map((c) => `LTRIM(RTRIM(ISNULL(CAST(C.[${c}] AS NVARCHAR(1000)), ''))) AS [${c}]`);
      const r = await pool.request().input("ind", sql.Int, kayit.CARIIND)
        .query(`SELECT ${secim.join(", ")} FROM [${tablo}] C WHERE C.IND = @ind`);
      const c = r.recordset[0];
      if (c) {
        adres.ALICIADRES = metinAl(c, "ADRESSEVK") || metinAl(c, "ADRESFATURA") || metinAl(c, "ADRESPOSTA");
        adres.ALICIIL = benzersizBirlestir([metinAl(c, "SEHIR"), metinAl(c, "IL")], " / ")
          + (metinAl(c, "POSTAKODU") ? ` ${metinAl(c, "POSTAKODU")}` : "");
        adres.ALICIYETKILI ||= metinAl(c, "YETKILI");
        adres.ALICITELEFON ||= metinAl(c, "YGSM") || metinAl(c, "TELEFON1");
      }
    }
    res.json({ ok: true, adres });
  } catch (err) {
    next(err);
  }
});

/** POST /api/servis — müşteri cihazıyla geldiğinde kabul kaydı açar. */
router.post("/", async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!/^\d+$/.test(String(b.CARIIND ?? "")) || Number(b.CARIIND) < 1) {
      return res.status(400).json({ ok: false, mesaj: "Müşteri seçilmedi." });
    }
    const cihazlar = (Array.isArray(b.cihazlar) ? b.cihazlar : []).map(cihazNormalize).filter(Boolean);
    if (!cihazlar.length) {
      return res.status(400).json({ ok: false, mesaj: "En az bir cihaz girilmeli." });
    }
    if (cihazlar.length > 20) {
      return res.status(400).json({ ok: false, mesaj: "Tek kabul kaydına en fazla 20 cihaz eklenebilir." });
    }

    const firmaNo = vega.pad4(b.FIRMANO);
    const donemNo = vega.pad4(b.DONEMNO);
    const cariInd = parseInt(b.CARIIND, 10);
    const { rows } = await cariCache.al(firmaNo, donemNo);
    const kart = rows.find((x) => x.IND === cariInd);
    if (!kart) return res.status(404).json({ ok: false, mesaj: "Cari bulunamadı." });
    const kullanici = String(req.kullanici || "").trim() || "bilinmiyor";
    // Telefon elle verilmediyse Vega kartından alınır; etikette bu görünür.
    const telefon = kirp(b.TELEFON, 40) || kart.GSM || kart.TELEFON1 || cariTelefonu(kart) || null;

    const islem = new sql.Transaction(db.ticket());
    await islem.begin();
    let kayitId;
    try {
      const r = await new sql.Request(islem)
        .input("firma", sql.NVarChar(4), firmaNo)
        .input("donem", sql.NVarChar(4), donemNo)
        .input("cari", sql.Int, cariInd)
        .input("carikodu", sql.NVarChar(50), kart.FIRMAKODU ?? null)
        .input("cariadi", sql.NVarChar(255), kart.AD ?? null)
        .input("telefon", sql.NVarChar(40), telefon)
        .input("yetkili", sql.NVarChar(100), kirp(b.YETKILI, 100) || kart.YETKILI || null)
        .input("notu", sql.NVarChar(sql.MAX), kirp(b.NOTU, 4000))
        .input("alan", sql.NVarChar(60), kullanici).query(`
          INSERT INTO dbo.SERVISKAYITLARI
            (FIRMANO, DONEMNO, CARIIND, CARIKODU, CARIADI, TELEFON, YETKILI, NOTU, TESLIMALAN)
          OUTPUT INSERTED.ID
          VALUES (@firma, @donem, @cari, @carikodu, @cariadi, @telefon, @yetkili, @notu, @alan)
        `);
      kayitId = r.recordset[0].ID;

      for (const [i, cihaz] of cihazlar.entries()) {
        await new sql.Request(islem)
          .input("servis", sql.Int, kayitId)
          .input("sira", sql.Int, i + 1)
          .input("cins", sql.NVarChar(40), cihaz.cins)
          .input("marka", sql.NVarChar(60), cihaz.marka)
          .input("model", sql.NVarChar(60), cihaz.model)
          .input("serino", sql.NVarChar(60), cihaz.seriNo)
          .input("ariza", sql.NVarChar(400), cihaz.ariza)
          .input("aksesuar", sql.NVarChar(200), cihaz.aksesuar).query(`
            INSERT INTO dbo.CIHAZLAR (SERVISID, SIRA, CINS, MARKA, MODEL, SERINO, ARIZA, AKSESUAR)
            VALUES (@servis, @sira, @cins, @marka, @model, @serino, @ariza, @aksesuar)
          `);
      }
      await islem.commit();
    } catch (err) {
      await islem.rollback().catch(() => { /* zaten geri alınmış */ });
      throw err;
    }
    res.status(201).json({ ok: true, kayit: await tekKayit(kayitId) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/servis/:id/gonderim — arızaya gönderir veya kargoya verir.
 * Durum değişimi ve gönderim satırı tek işlemde yazılır; biri olmadan diğeri kalmaz.
 */
router.post("/:id/gonderim", async (req, res, next) => {
  try {
    const id = gecerliId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const rv = rvCevir(req.body?.RV);
    if (!rv) return res.status(400).json({ ok: false, mesaj: "Geçerli RV zorunlu." });
    const { hata, tur, alanlar } = gonderimNormalize(req.body);
    if (hata) return res.status(400).json({ ok: false, mesaj: hata });
    const kullanici = String(req.kullanici || "").trim() || "bilinmiyor";

    const islem = new sql.Transaction(db.ticket());
    await islem.begin();
    try {
      const guncelle = await new sql.Request(islem)
        .input("id", sql.Int, id)
        .input("rv", sql.VarBinary(8), rv)
        .input("durum", sql.NVarChar(20), GONDERIM_DURUMU[tur])
        .input("kullanici", sql.NVarChar(60), kullanici).query(`
          UPDATE dbo.SERVISKAYITLARI SET
            DURUM = @durum, TESLIMTARIHI = NULL, GUNCELLEYEN = @kullanici, GUNCELLEMETARIHI = GETDATE()
          WHERE ID = @id AND SILINDI = 0 AND RV = @rv
        `);
      if (!guncelle.rowsAffected[0]) {
        await islem.rollback();
        return res.status(409).json({
          ok: false, cakisma: true,
          mesaj: "Bu kaydı başka bir kullanıcı değiştirdi. Liste tazelendi, tekrar deneyin.",
          kayit: await tekKayit(id),
        });
      }
      const ekle = new sql.Request(islem)
        .input("servis", sql.Int, id)
        .input("tur", sql.NVarChar(10), tur)
        .input("gonderen", sql.NVarChar(60), kullanici);
      for (const [kolon, parametre, tip] of GONDERIM_ALANLARI) ekle.input(parametre, tip, alanlar[kolon]);
      await ekle.query(`
        INSERT INTO dbo.SERVISGONDERIMLERI
          (SERVISID, TUR, ${GONDERIM_ALANLARI.map(([k]) => k).join(", ")}, GONDEREN)
        VALUES (@servis, @tur, ${GONDERIM_ALANLARI.map(([, p]) => `@${p}`).join(", ")}, @gonderen)
      `);
      await islem.commit();
    } catch (err) {
      await islem.rollback().catch(() => { /* zaten geri alınmış */ });
      throw err;
    }
    res.status(201).json({ ok: true, kayit: await tekKayit(id) });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/servis/gonderim/:id — takip no gibi sonradan belli olan bilgiler. */
router.patch("/gonderim/:id", async (req, res, next) => {
  try {
    const id = gecerliId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const b = req.body || {};
    const setler = [];
    const istek = db.ticket().request().input("id", sql.Int, id);
    for (const [kolon, parametre, tip, uzunluk] of GONDERIM_ALANLARI) {
      if (!Object.hasOwn(b, kolon)) continue;
      const deger = kirp(b[kolon], uzunluk);
      if (kolon === "ALICIADI" && !deger) return res.status(400).json({ ok: false, mesaj: "Alıcı adı zorunlu." });
      setler.push(`${kolon} = @${parametre}`);
      istek.input(parametre, tip, deger);
    }
    if (!setler.length) return res.status(400).json({ ok: false, mesaj: "Değiştirilecek alan yok." });
    const r = await istek.query(`
      UPDATE dbo.SERVISGONDERIMLERI SET ${setler.join(", ")}
      OUTPUT ${cikti(GONDERIM_SUTUNLARI)}
      WHERE ID = @id
    `);
    if (!r.recordset.length) return res.status(404).json({ ok: false, mesaj: "Gönderim bulunamadı." });
    res.json({ ok: true, gonderim: r.recordset[0] });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/servis/:id — durum, not ve teslim bilgisi. */
router.patch("/:id", async (req, res, next) => {
  try {
    const id = gecerliId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const b = req.body || {};
    const rv = rvCevir(b.RV);
    if (!rv) return res.status(400).json({ ok: false, mesaj: "Geçerli RV zorunlu." });

    const setler = [];
    const istek = db.ticket().request().input("id", sql.Int, id).input("rv", sql.VarBinary(8), rv);
    if (Object.hasOwn(b, "DURUM")) {
      const durum = String(b.DURUM || "").toUpperCase();
      if (!DURUMLAR.includes(durum)) return res.status(400).json({ ok: false, mesaj: "Geçersiz durum." });
      setler.push("DURUM = @durum");
      // Teslim tarihi elle değil, duruma bağlı yazılır; geri alınırsa temizlenir.
      setler.push("TESLIMTARIHI = CASE WHEN @durum = 'TESLIM' THEN GETDATE() ELSE NULL END");
      istek.input("durum", sql.NVarChar(20), durum);
    }
    if (Object.hasOwn(b, "NOTU")) {
      setler.push("NOTU = @notu");
      istek.input("notu", sql.NVarChar(sql.MAX), kirp(b.NOTU, 4000));
    }
    if (Object.hasOwn(b, "YETKILI")) {
      setler.push("YETKILI = @yetkili");
      istek.input("yetkili", sql.NVarChar(100), kirp(b.YETKILI, 100));
    }
    if (Object.hasOwn(b, "TELEFON")) {
      setler.push("TELEFON = @telefon");
      istek.input("telefon", sql.NVarChar(40), kirp(b.TELEFON, 40));
    }
    if (!setler.length) return res.status(400).json({ ok: false, mesaj: "Değiştirilecek alan yok." });

    const kullanici = String(req.kullanici || "").trim() || "bilinmiyor";
    setler.push("GUNCELLEYEN = @kullanici", "GUNCELLEMETARIHI = GETDATE()");
    istek.input("kullanici", sql.NVarChar(60), kullanici);

    const r = await istek.query(`
      UPDATE dbo.SERVISKAYITLARI SET ${setler.join(", ")}
      OUTPUT INSERTED.ID
      WHERE ID = @id AND SILINDI = 0 AND RV = @rv
    `);
    if (!r.recordset.length) {
      return res.status(409).json({
        ok: false, cakisma: true,
        mesaj: "Bu kaydı başka bir kullanıcı değiştirdi. Güncel hali yüklendi.",
        kayit: await tekKayit(id),
      });
    }
    res.json({ ok: true, kayit: await tekKayit(id) });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/servis/cihaz/:id — cihaz bilgisi, arıza notu, yapılan işlem. */
router.patch("/cihaz/:id", async (req, res, next) => {
  try {
    const id = gecerliId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const b = req.body || {};
    const rv = rvCevir(b.RV);
    if (!rv) return res.status(400).json({ ok: false, mesaj: "Geçerli RV zorunlu." });

    const alanlar = [
      ["CINS", "cins", sql.NVarChar(40), 40],
      ["MARKA", "marka", sql.NVarChar(60), 60],
      ["MODEL", "model", sql.NVarChar(60), 60],
      ["SERINO", "serino", sql.NVarChar(60), 60],
      ["ARIZA", "ariza", sql.NVarChar(400), 400],
      ["AKSESUAR", "aksesuar", sql.NVarChar(200), 200],
      ["YAPILANISLEM", "yapilan", sql.NVarChar(400), 400],
    ];
    const setler = [];
    const istek = db.ticket().request().input("id", sql.Int, id).input("rv", sql.VarBinary(8), rv);
    for (const [sutun, ad, tip, uzunluk] of alanlar) {
      if (!Object.hasOwn(b, sutun)) continue;
      setler.push(`${sutun} = @${ad}`);
      istek.input(ad, tip, kirp(b[sutun], uzunluk));
    }
    if (Object.hasOwn(b, "DURUM")) {
      const durum = String(b.DURUM || "").toUpperCase();
      if (!DURUMLAR.includes(durum)) return res.status(400).json({ ok: false, mesaj: "Geçersiz durum." });
      setler.push("DURUM = @durum");
      istek.input("durum", sql.NVarChar(20), durum);
    }
    if (!setler.length) return res.status(400).json({ ok: false, mesaj: "Değiştirilecek alan yok." });

    const r = await istek.query(`
      UPDATE dbo.CIHAZLAR SET ${setler.join(", ")}
      OUTPUT ${cikti(CIHAZ_SUTUNLARI)}
      WHERE ID = @id AND RV = @rv
    `);
    if (!r.recordset.length) {
      return res.status(409).json({ ok: false, cakisma: true, mesaj: "Bu cihazı başka bir kullanıcı değiştirdi." });
    }
    res.json({ ok: true, cihaz: disaAktar(r.recordset[0]) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/servis/:id/cihaz — mevcut kabule sonradan cihaz ekler. */
router.post("/:id/cihaz", async (req, res, next) => {
  try {
    const servisId = gecerliId(req.params.id);
    if (!servisId) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const cihaz = cihazNormalize(req.body);
    if (!cihaz) return res.status(400).json({ ok: false, mesaj: "Cihaz bilgisi boş." });

    const r = await db.ticket().request()
      .input("servis", sql.Int, servisId)
      .input("cins", sql.NVarChar(40), cihaz.cins)
      .input("marka", sql.NVarChar(60), cihaz.marka)
      .input("model", sql.NVarChar(60), cihaz.model)
      .input("serino", sql.NVarChar(60), cihaz.seriNo)
      .input("ariza", sql.NVarChar(400), cihaz.ariza)
      .input("aksesuar", sql.NVarChar(200), cihaz.aksesuar).query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.SERVISKAYITLARI WHERE ID = @servis AND SILINDI = 0)
          THROW 51000, 'Servis kaydı bulunamadı.', 1;

        INSERT INTO dbo.CIHAZLAR (SERVISID, SIRA, CINS, MARKA, MODEL, SERINO, ARIZA, AKSESUAR)
        OUTPUT ${cikti(CIHAZ_SUTUNLARI)}
        SELECT @servis,
          ISNULL((SELECT MAX(SIRA) FROM dbo.CIHAZLAR WHERE SERVISID = @servis), 0) + 1,
          @cins, @marka, @model, @serino, @ariza, @aksesuar
      `);
    res.status(201).json({ ok: true, cihaz: disaAktar(r.recordset[0]) });
  } catch (err) {
    if (/Servis kaydı bulunamadı/.test(err.message)) {
      return res.status(404).json({ ok: false, mesaj: "Servis kaydı bulunamadı." });
    }
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = gecerliId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, mesaj: "Geçersiz ID." });
    const kullanici = String(req.kullanici || "").trim() || "bilinmiyor";
    const r = await db.ticket().request()
      .input("id", sql.Int, id)
      .input("kullanici", sql.NVarChar(60), kullanici).query(`
        UPDATE dbo.SERVISKAYITLARI
        SET SILINDI = 1, GUNCELLEYEN = @kullanici, GUNCELLEMETARIHI = GETDATE()
        WHERE ID = @id AND SILINDI = 0
      `);
    if (!r.rowsAffected[0]) return res.status(404).json({ ok: false, mesaj: "Servis kaydı bulunamadı." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.DURUMLAR = DURUMLAR;
module.exports.GRUPLAR = GRUPLAR;
module.exports.GONDERIM_DURUMU = GONDERIM_DURUMU;
module.exports.SERVIS_SUTUNLARI = SERVIS_SUTUNLARI;
module.exports.CIHAZ_SUTUNLARI = CIHAZ_SUTUNLARI;
module.exports.disaAktar = disaAktar;
module.exports.gonderimNormalize = gonderimNormalize;
