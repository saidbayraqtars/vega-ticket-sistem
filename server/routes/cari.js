const express = require("express");
const sql = require("mssql");
const db = require("../lib/db");
const vega = require("../lib/vega");
const arama = require("../lib/arama");
const cariCache = require("../lib/cariCache");
const { hesaplaMusteriSuresi } = require("../lib/musteriSuresi");
const { normalizeTur, TUR_YENI } = require("../lib/sozlesme");
const { tarihCevir } = require("../lib/ticketKurallari");

const router = express.Router();

async function sureHaritasi(firmaNo) {
  const r = await db.ticket().request().input("firma", sql.NVarChar(4), firmaNo).query(`
    SELECT CARIIND, CONVERT(char(10), BASLANGICTARIHI, 23) AS BASLANGICTARIHI, SUREAY, RV
    FROM dbo.CARISURELERI WHERE FIRMANO = @firma
  `);
  return new Map(r.recordset.map((x) => [x.CARIIND, x]));
}

/**
 * Süre tablosunun parmak izi. ROWVERSION veritabanı genelinde artan olduğu
 * için satır sayısı + en büyük RV, tablodaki her değişikliği yakalar.
 */
function sureImzasi(sureler) {
  let enBuyuk = "";
  for (const kayit of sureler.values()) {
    const rv = kayit.RV ? Buffer.from(kayit.RV).toString("hex") : "";
    if (rv > enBuyuk) enBuyuk = rv;
  }
  return `${sureler.size}:${enBuyuk}`;
}

/**
 * Zenginleştirilmiş ve sıralanmış liste önbelleği.
 *
 * Bu iş 39 bin kartta ~130 ms CPU tutuyordu ve Node tek iş parçacıklı olduğu
 * için HER istekte sunucunun tamamını o süre boyunca kilitliyordu — sayfa
 * değiştirme, sıralama, tazeleme, hepsi. Girdiler (cari önbelleği + süre
 * tablosu) değişmediği sürece sonucu yeniden kullanıyoruz.
 */
const listeBellek = new Map();
const LISTE_BELLEK_SINIRI = 12;
// localeCompare her çağrıda yerel ayarı yeniden çözer; tek Collator ~2 kat hızlı.
const trSirala = new Intl.Collator("tr", { sensitivity: "base", numeric: true });

function siraliListe(firmaNo, donemNo, onbellek, sureler, sirala, yon) {
  // Gün de imzaya girer: sözleşme durumu "bugün"e göre hesaplandığı için
  // gece yarısını geçen oturumda önbellek kendiliğinden tazelenmeli.
  const gun = new Date().toISOString().slice(0, 10);
  const imza = `${gun}|${onbellek.ts}|${sureImzasi(sureler)}`;
  const anahtar = `${firmaNo}:${donemNo}:${sirala}:${yon}`;
  const mevcut = listeBellek.get(anahtar);
  if (mevcut?.imza === imza) return mevcut.liste;

  const bugun = new Date();
  const liste = onbellek.rows.map((r) => zenginlestir(r, sureler, bugun));
  const carpan = yon === "desc" ? -1 : 1;
  liste.sort((a, b) => {
    if (sirala === "bakiye") return (Number(a.BAKIYE) - Number(b.BAKIYE)) * carpan;
    if (sirala === "kod") return trSirala.compare(a.FIRMAKODU, b.FIRMAKODU) * carpan;
    if (sirala === "bitis") {
      const av = String(a.sure.bitisISO || "9999-12-31");
      const bv = String(b.sure.bitisISO || "9999-12-31");
      return (av < bv ? -1 : av > bv ? 1 : 0) * carpan;
    }
    return trSirala.compare(a.AD, b.AD) * carpan;
  });

  // Aynı önbellek sürümüne ait eski sıralama girdileri artık geçersiz.
  for (const [k, v] of listeBellek) if (v.imza !== imza && listeBellek.size > LISTE_BELLEK_SINIRI) listeBellek.delete(k);
  listeBellek.set(anahtar, { imza, liste });
  return liste;
}

/** Süre yazıldığında/silindiğinde çağrılır — imza zaten değişir, bu ek güvence. */
function listeBellekTemizle() {
  listeBellek.clear();
}

function zenginlestir(kart, sureler, bugun = new Date()) {
  const sure = hesaplaMusteriSuresi(kart, sureler.get(kart.IND), bugun);
  const bakiye = Number(kart.BAKIYE || 0);
  return {
    ...kart,
    sozlesme: sure,
    sure,
    borcDurumu: bakiye > 0.005 ? "BORCLU" : bakiye < -0.005 ? "ALACAKLI" : "BORCU_YOK",
  };
}

/** Excel benzeri müşteri listesi; bakiye seçilen Vega döneminin hareket toplamıdır. */
router.get("/liste", async (req, res, next) => {
  try {
    const firmaNo = vega.pad4(req.query.firma);
    const donemNo = vega.pad4(req.query.donem);
    const [onbellek, sureler] = await Promise.all([
      cariCache.al(firmaNo, donemNo, { zorla: req.query.yenile === "1" }),
      sureHaritasi(firmaNo),
    ]);
    const limit = Math.min(parseInt(req.query.limit, 10) || 300, 2000);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const sirala = String(req.query.sirala || "ad");
    const yon = String(req.query.yon || "asc") === "desc" ? "desc" : "asc";
    const liste = siraliListe(firmaNo, donemNo, onbellek, sureler, sirala, yon);

    res.json({ ok: true, toplam: liste.length, offset, limit, kayitlar: liste.slice(offset, offset + limit) });
  } catch (err) {
    next(err);
  }
});

/** Büyük üst arama alanı için hızlı, Türkçe duyarlı müşteri araması. */
router.get("/ara", async (req, res, next) => {
  try {
    const firmaNo = vega.pad4(req.query.firma);
    const donemNo = vega.pad4(req.query.donem);
    const [{ indeks }, sureler] = await Promise.all([
      cariCache.al(firmaNo, donemNo),
      sureHaritasi(firmaNo),
    ]);
    const q = String(req.query.q || "");
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 200);
    const sonuc = arama.ara(indeks, q, { limit });
    res.json({
      ok: true,
      sorgu: q,
      bulanik: sonuc.bulanik,
      oneri: sonuc.oneri,
      kayitlar: sonuc.sonuclar.map((r) => zenginlestir(r, sureler)),
    });
  } catch (err) {
    next(err);
  }
});

/** Uygulamaya özel yeni müşteri süresi: Vega kartına yazılmaz. */
router.put("/:ind/sure", async (req, res, next) => {
  try {
    const firmaNo = vega.pad4(req.body?.firma ?? req.query.firma);
    const donemNo = vega.pad4(req.body?.donem ?? req.query.donem);
    const ind = parseInt(req.params.ind, 10);
    const sureAy = Number(req.body?.sureAy);
    const baslangicMetin = String(req.body?.baslangic || "");
    const baslangic = tarihCevir(baslangicMetin);
    if (!Number.isInteger(ind) || ind < 1) {
      return res.status(400).json({ ok: false, mesaj: "Geçersiz cari numarası." });
    }
    if (!Number.isInteger(sureAy) || sureAy < 1 || sureAy > 12) {
      return res.status(400).json({ ok: false, mesaj: "Süre 1 ile 12 ay arasında olmalı." });
    }
    if (!(baslangic instanceof Date)) {
      return res.status(400).json({ ok: false, mesaj: "Başlangıç tarihi geçersiz." });
    }
    const { rows } = await cariCache.al(firmaNo, donemNo);
    const kart = rows.find((x) => x.IND === ind);
    if (!kart) return res.status(404).json({ ok: false, mesaj: "Cari bulunamadı." });
    if (normalizeTur(kart.KOD1) !== TUR_YENI) {
      return res.status(400).json({
        ok: false,
        mesaj: "Süre yalnız özel kodu YENİ MÜŞTERİ olan carilere tanımlanabilir. Anlaşmalı müşteride süre otomatik 1 yıldır.",
      });
    }

    const kullanici = String(req.kullanici || "").trim() || "bilinmiyor";
    await db.ticket().request()
      .input("firma", sql.NVarChar(4), firmaNo)
      .input("cari", sql.Int, ind)
      // DATE değerini JS Date olarak yollamak UTC dönüşümünde bir gün
      // kaydırabildiği için doğrulanmış ISO metni SQL'de DATE'e çeviriyoruz.
      .input("baslangic", sql.NVarChar(10), baslangicMetin)
      .input("sure", sql.TinyInt, sureAy)
      .input("kullanici", sql.NVarChar(60), kullanici).query(`
        MERGE dbo.CARISURELERI WITH (HOLDLOCK) AS H
        USING (SELECT @firma AS FIRMANO, @cari AS CARIIND) AS K
          ON H.FIRMANO = K.FIRMANO AND H.CARIIND = K.CARIIND
        WHEN MATCHED THEN UPDATE SET
          BASLANGICTARIHI = CONVERT(date, @baslangic, 23), SUREAY = @sure,
          GUNCELLEYEN = @kullanici, GUNCELLEMETARIHI = GETDATE()
        WHEN NOT MATCHED THEN INSERT
          (FIRMANO, CARIIND, BASLANGICTARIHI, SUREAY, OLUSTURAN)
          VALUES (@firma, @cari, CONVERT(date, @baslangic, 23), @sure, @kullanici);
      `);
    const sureler = await sureHaritasi(firmaNo);
    listeBellekTemizle();
    res.json({ ok: true, kart: zenginlestir(kart, sureler) });
  } catch (err) {
    next(err);
  }
});

/** Özel süreyi kaldırınca kart yeniden Vega'daki mevcut bilgiye döner. */
router.delete("/:ind/sure", async (req, res, next) => {
  try {
    const firmaNo = vega.pad4(req.query.firma);
    const ind = parseInt(req.params.ind, 10);
    if (!Number.isInteger(ind)) return res.status(400).json({ ok: false, mesaj: "Geçersiz cari numarası." });
    await db.ticket().request().input("firma", sql.NVarChar(4), firmaNo).input("cari", sql.Int, ind)
      .query(`DELETE FROM dbo.CARISURELERI WHERE FIRMANO = @firma AND CARIIND = @cari`);
    listeBellekTemizle();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Müşteri kartı + dönem bakiyesi + yalnız tamamlanan işlemler. */
router.get("/:ind", async (req, res, next) => {
  try {
    const firmaNo = vega.pad4(req.query.firma);
    const donemNo = vega.pad4(req.query.donem);
    const ind = parseInt(req.params.ind, 10);
    if (!Number.isInteger(ind)) return res.status(400).json({ ok: false, mesaj: "Geçersiz cari numarası." });

    const [{ rows }, sureler] = await Promise.all([
      cariCache.al(firmaNo, donemNo),
      sureHaritasi(firmaNo),
    ]);
    const hamKart = rows.find((r) => r.IND === ind);
    if (!hamKart) return res.status(404).json({ ok: false, mesaj: "Cari bulunamadı." });
    const kart = zenginlestir(hamKart, sureler);
    const t = await db.ticket().request()
      .input("firma", sql.NVarChar(4), firmaNo)
      .input("cari", sql.Int, ind).query(`
        SELECT TOP 200 ID, BASLIK, UCRET, KAPANISTARIHI, OLUSTURAN, RV
        FROM dbo.TICKETLER
        WHERE FIRMANO = @firma AND CARIIND = @cari AND SILINDI = 0 AND DURUM = 'KAPALI'
        ORDER BY KAPANISTARIHI DESC, ID DESC
      `);
    res.json({
      ok: true,
      kart,
      ozet: { borc: Number(kart.BORC), alacak: Number(kart.ALACAK), bakiye: Number(kart.BAKIYE) },
      ticketlar: t.recordset.map((x) => ({ ...x, RV: x.RV ? Buffer.from(x.RV).toString("hex") : null })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
