const sql = require("mssql");
const db = require("./db");
const { cariTelefonlari } = require("./telefon");

const MESAJ_PENCERESI_DAKIKA = 30;
const MESAJ_PENCERESI_MS = MESAJ_PENCERESI_DAKIKA * 60 * 1000;
const VARSAYILAN_MESAJ_SABLONU = "Merhaba, “{islem}” işlemi için uzak bağlantı ile sorununuz çözülmüştür. İyi günler dileriz.";
const MESAJ_DEGISKENLERI = ["{firma}", "{ad}", "{unvan}", "{kod}", "{carikodu}", "{islem}", "{ucret}", "{tarih}", "{kullanici}"];
const DEGISKEN_ADLARI = new Set(MESAJ_DEGISKENLERI.map((x) => x.slice(1, -1)));

function mesajSablonuDogrula(sablon) {
  const sonuc = String(sablon ?? "").trim();
  if (!sonuc || sonuc.length > 1000) return null;
  const bulunanlar = [...sonuc.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1].toLocaleLowerCase("tr-TR"));
  return bulunanlar.every((ad) => DEGISKEN_ADLARI.has(ad)) ? sonuc : null;
}

function mesajSablonuDoldur(sablon, veri = {}) {
  const gecerli = mesajSablonuDogrula(sablon || VARSAYILAN_MESAJ_SABLONU);
  if (!gecerli) return null;
  const musteri = String(veri.musteri || "");
  const degerler = {
    firma: musteri,
    ad: musteri,
    unvan: musteri,
    kod: String(veri.cariKodu || ""),
    carikodu: String(veri.cariKodu || ""),
    islem: String(veri.islem || ""),
    ucret: Number(veri.ucret || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    tarih: (veri.tarih instanceof Date ? veri.tarih : new Date(veri.tarih || Date.now())).toLocaleDateString("tr-TR"),
    kullanici: String(veri.kullanici || ""),
  };
  return gecerli.replace(/\{([^{}]+)\}/g, (_tum, ad) => degerler[String(ad).toLocaleLowerCase("tr-TR")] ?? "");
}

function mesajOlustur(islem) {
  return mesajSablonuDoldur(VARSAYILAN_MESAJ_SABLONU, { islem });
}

function mesajMetniCevir(metin, islem) {
  const sonuc = String(metin || mesajOlustur(islem)).trim();
  return sonuc && sonuc.length <= 1000 ? sonuc : null;
}

function mesajPenceresiAcik(kayitTarihi, simdi = new Date()) {
  const kayit = kayitTarihi instanceof Date ? kayitTarihi : new Date(kayitTarihi);
  const an = simdi instanceof Date ? simdi : new Date(simdi);
  if (Number.isNaN(kayit.getTime()) || Number.isNaN(an.getTime())) return false;
  const gecen = an.getTime() - kayit.getTime();
  return gecen >= 0 && gecen < MESAJ_PENCERESI_MS;
}

/** "905..,905.." kuyruk alanını diziye çevirir. */
const telefonListesi = (deger) => String(deger || "").split(",").map((x) => x.trim()).filter(Boolean);

function disaAktar(row) {
  if (!row) return null;
  const durum = row.DURUM;
  const gonderildi = durum === "GONDERILDI";
  const sirada = durum === "BEKLIYOR" || durum === "GONDERILIYOR";
  const iptal = durum === "IPTAL";
  const telefonlar = telefonListesi(row.TELEFONLAR || row.TELEFON);
  const numara = telefonlar.length > 1 ? `${telefonlar.length} numaraya ` : "";
  let mesaj = row.SONHATA;
  if (gonderildi) mesaj = `WhatsApp mesajı ana bilgisayardan ${numara}gönderildi.`;
  else if (sirada) mesaj = `WhatsApp mesajı ana bilgisayarda ${numara}gönderim sırasına alındı.`;
  else if (iptal) mesaj = `WhatsApp mesajı ${MESAJ_PENCERESI_DAKIKA} dakika içinde gönderilemediği için iptal edildi.`;
  else mesaj ||= "WhatsApp mesajı gönderilemedi.";
  return {
    ticketId: row.TICKETID,
    durum,
    gonderildi,
    sirada,
    iptal,
    telefon: row.TELEFON || null,
    telefonlar,
    gonderilenler: telefonListesi(row.GONDERILENLER),
    mesajId: row.MESAJID || null,
    mesaj,
    deneme: Number(row.DENEME || 0),
    gonderimTarihi: row.GONDERIMTARIHI || null,
    metin: row.METIN || null,
  };
}

const MESAJ_SUTUNLARI = `TICKETID, TELEFON, TELEFONLAR, GONDERILENLER, METIN, DURUM, DENEME, MESAJID, SONHATA, GONDERIMTARIHI`;

// Pencerenin kesin sınırı SQL Server saatiyle uygulanır; istemci saati yetkili değil.
const SURESI_DOLDU = `DATEADD(MINUTE, ${MESAJ_PENCERESI_DAKIKA}, KAYITTARIHI) <= GETDATE()`;
const SURESI_DOLDU_PARAM = `DATEADD(MINUTE, ${MESAJ_PENCERESI_DAKIKA}, @kayit) <= GETDATE()`;
const SURE_HATASI = `${MESAJ_PENCERESI_DAKIKA} dakika içinde gönderilemedi.`;

/** Tüm makineler mesajı ortak DB kuyruğuna bırakır; yalnız ana makine gönderir. */
async function bildirimGonder(kart, islem, { ticketId, firmaNo, donemNo, kayitTarihi, simdi, metin } = {}) {
  // simdi yalnız saf kural testleri için verilir. Üretimde kesin sınır SQL
  // Server GETDATE() ile uygulanır; istemci bilgisayarın saati yetkili değildir.
  if (simdi && !mesajPenceresiAcik(kayitTarihi, simdi)) {
    return {
      ticketId,
      durum: "IPTAL",
      gonderildi: false,
      sirada: false,
      iptal: true,
      telefon: null,
      telefonlar: [],
      mesaj: `WhatsApp mesajı, işlem kaydından sonraki ${MESAJ_PENCERESI_DAKIKA} dakika içinde gönderilemediği için iptal edildi.`,
    };
  }
  if (!Number.isInteger(Number(ticketId)) || Number(ticketId) < 1) {
    throw new Error("WhatsApp kuyruğu için işlem kaydı kimliği gerekli.");
  }
  const mesajMetni = mesajMetniCevir(metin, islem);
  if (!mesajMetni) throw new Error("WhatsApp mesajı 1-1000 karakter olmalı.");

  const telefonlar = cariTelefonlari(kart);
  const telefon = telefonlar[0] || "";
  const ilkDurum = telefon ? "BEKLIYOR" : "HATA";
  const ilkHata = telefon ? null : "Caride WhatsApp'a uygun cep telefonu bulunamadı.";
  const r = await db.ticket().request()
    .input("ticket", sql.Int, Number(ticketId))
    .input("firma", sql.NVarChar(4), String(firmaNo))
    .input("donem", sql.NVarChar(4), String(donemNo))
    .input("cari", sql.Int, Number(kart.IND))
    .input("telefon", sql.NVarChar(20), telefon || null)
    .input("telefonlar", sql.NVarChar(100), telefonlar.join(",") || null)
    .input("metin", sql.NVarChar(1000), mesajMetni)
    .input("kayit", sql.DateTime, kayitTarihi)
    .input("durum", sql.NVarChar(20), ilkDurum)
    .input("hata", sql.NVarChar(1000), ilkHata).query(`
      MERGE dbo.WHATSAPPMESAJLARI WITH (HOLDLOCK) AS H
      USING (SELECT @ticket AS TICKETID) AS K ON H.TICKETID = K.TICKETID
      -- GONDERILIYOR satırı ana makinenin elindedir; ezersek sonuç kaybolur ve
      -- mesaj ikinci kez gönderilir. Yalnız sahipsiz satırlar tazelenir.
      WHEN MATCHED AND H.DURUM IN ('BEKLIYOR', 'HATA') THEN UPDATE SET
        TELEFON = @telefon, TELEFONLAR = @telefonlar, METIN = @metin,
        DURUM = CASE WHEN ${SURESI_DOLDU_PARAM} THEN 'IPTAL' ELSE @durum END,
        SONHATA = CASE WHEN ${SURESI_DOLDU_PARAM} THEN '${SURE_HATASI}' ELSE @hata END,
        GUNCELLEMETARIHI = GETDATE()
      WHEN NOT MATCHED THEN INSERT
        (TICKETID, FIRMANO, DONEMNO, CARIIND, TELEFON, TELEFONLAR, METIN, KAYITTARIHI, DURUM, SONHATA)
        VALUES (@ticket, @firma, @donem, @cari, @telefon, @telefonlar, @metin, @kayit,
          CASE WHEN ${SURESI_DOLDU_PARAM} THEN 'IPTAL' ELSE @durum END,
          CASE WHEN ${SURESI_DOLDU_PARAM} THEN '${SURE_HATASI}' ELSE @hata END);

      SELECT ${MESAJ_SUTUNLARI} FROM dbo.WHATSAPPMESAJLARI WHERE TICKETID = @ticket;
    `);
  return disaAktar(r.recordset[0]);
}

async function mesajDurumu(ticketId) {
  const r = await db.ticket().request().input("ticket", sql.Int, Number(ticketId)).query(`
    UPDATE dbo.WHATSAPPMESAJLARI SET
      DURUM = 'IPTAL', SONHATA = '${SURE_HATASI}', GUNCELLEMETARIHI = GETDATE()
    WHERE TICKETID = @ticket AND DURUM IN ('BEKLIYOR','HATA')
      AND ${SURESI_DOLDU};
    SELECT ${MESAJ_SUTUNLARI} FROM dbo.WHATSAPPMESAJLARI WHERE TICKETID = @ticket
  `);
  return disaAktar(r.recordset[0]);
}

module.exports = {
  MESAJ_PENCERESI_DAKIKA,
  VARSAYILAN_MESAJ_SABLONU,
  MESAJ_DEGISKENLERI,
  SURESI_DOLDU,
  SURE_HATASI,
  mesajOlustur,
  mesajSablonuDogrula,
  mesajSablonuDoldur,
  mesajMetniCevir,
  mesajPenceresiAcik,
  telefonListesi,
  disaAktar,
  bildirimGonder,
  mesajDurumu,
};
