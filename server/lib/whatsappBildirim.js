const sql = require("mssql");
const db = require("./db");
const { cariTelefonu } = require("./telefon");

const MESAJ_PENCERESI_DAKIKA = 30;
const MESAJ_PENCERESI_MS = MESAJ_PENCERESI_DAKIKA * 60 * 1000;

function mesajOlustur(islem) {
  return `Merhaba, “${String(islem || "").trim()}” işlemi için uzak bağlantı ile sorununuz çözülmüştür. İyi günler dileriz.`;
}

function mesajPenceresiAcik(kayitTarihi, simdi = new Date()) {
  const kayit = kayitTarihi instanceof Date ? kayitTarihi : new Date(kayitTarihi);
  const an = simdi instanceof Date ? simdi : new Date(simdi);
  if (Number.isNaN(kayit.getTime()) || Number.isNaN(an.getTime())) return false;
  const gecen = an.getTime() - kayit.getTime();
  return gecen >= 0 && gecen < MESAJ_PENCERESI_MS;
}

function disaAktar(row) {
  if (!row) return null;
  const durum = row.DURUM;
  const gonderildi = durum === "GONDERILDI";
  const sirada = durum === "BEKLIYOR" || durum === "GONDERILIYOR";
  const iptal = durum === "IPTAL";
  let mesaj = row.SONHATA;
  if (gonderildi) mesaj = "WhatsApp mesajı ana bilgisayardan gönderildi.";
  else if (sirada) mesaj = "WhatsApp mesajı ana bilgisayarda gönderim sırasına alındı.";
  else if (iptal) mesaj = `WhatsApp mesajı ${MESAJ_PENCERESI_DAKIKA} dakika içinde gönderilemediği için iptal edildi.`;
  else mesaj ||= "WhatsApp mesajı gönderilemedi.";
  return {
    ticketId: row.TICKETID,
    durum,
    gonderildi,
    sirada,
    iptal,
    telefon: row.TELEFON || null,
    mesajId: row.MESAJID || null,
    mesaj,
    deneme: Number(row.DENEME || 0),
    gonderimTarihi: row.GONDERIMTARIHI || null,
  };
}

const MESAJ_SUTUNLARI = `TICKETID, TELEFON, DURUM, DENEME, MESAJID, SONHATA, GONDERIMTARIHI`;

// Pencerenin kesin sınırı SQL Server saatiyle uygulanır; istemci saati yetkili değil.
const SURESI_DOLDU = `DATEADD(MINUTE, ${MESAJ_PENCERESI_DAKIKA}, KAYITTARIHI) <= GETDATE()`;
const SURESI_DOLDU_PARAM = `DATEADD(MINUTE, ${MESAJ_PENCERESI_DAKIKA}, @kayit) <= GETDATE()`;
const SURE_HATASI = `${MESAJ_PENCERESI_DAKIKA} dakika içinde gönderilemedi.`;

/** Tüm makineler mesajı ortak DB kuyruğuna bırakır; yalnız ana makine gönderir. */
async function bildirimGonder(kart, islem, { ticketId, firmaNo, donemNo, kayitTarihi, simdi } = {}) {
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
      mesaj: `WhatsApp mesajı, işlem kaydından sonraki ${MESAJ_PENCERESI_DAKIKA} dakika içinde gönderilemediği için iptal edildi.`,
    };
  }
  if (!Number.isInteger(Number(ticketId)) || Number(ticketId) < 1) {
    throw new Error("WhatsApp kuyruğu için işlem kaydı kimliği gerekli.");
  }

  const telefon = cariTelefonu(kart);
  const ilkDurum = telefon ? "BEKLIYOR" : "HATA";
  const ilkHata = telefon ? null : "Caride WhatsApp'a uygun cep telefonu bulunamadı.";
  const r = await db.ticket().request()
    .input("ticket", sql.Int, Number(ticketId))
    .input("firma", sql.NVarChar(4), String(firmaNo))
    .input("donem", sql.NVarChar(4), String(donemNo))
    .input("cari", sql.Int, Number(kart.IND))
    .input("telefon", sql.NVarChar(20), telefon || null)
    .input("metin", sql.NVarChar(1000), mesajOlustur(islem))
    .input("kayit", sql.DateTime, kayitTarihi)
    .input("durum", sql.NVarChar(20), ilkDurum)
    .input("hata", sql.NVarChar(1000), ilkHata).query(`
      MERGE dbo.WHATSAPPMESAJLARI WITH (HOLDLOCK) AS H
      USING (SELECT @ticket AS TICKETID) AS K ON H.TICKETID = K.TICKETID
      -- GONDERILIYOR satırı ana makinenin elindedir; ezersek sonuç kaybolur ve
      -- mesaj ikinci kez gönderilir. Yalnız sahipsiz satırlar tazelenir.
      WHEN MATCHED AND H.DURUM IN ('BEKLIYOR', 'HATA') THEN UPDATE SET
        TELEFON = @telefon, METIN = @metin,
        DURUM = CASE WHEN ${SURESI_DOLDU_PARAM} THEN 'IPTAL' ELSE @durum END,
        SONHATA = CASE WHEN ${SURESI_DOLDU_PARAM} THEN '${SURE_HATASI}' ELSE @hata END,
        GUNCELLEMETARIHI = GETDATE()
      WHEN NOT MATCHED THEN INSERT
        (TICKETID, FIRMANO, DONEMNO, CARIIND, TELEFON, METIN, KAYITTARIHI, DURUM, SONHATA)
        VALUES (@ticket, @firma, @donem, @cari, @telefon, @metin, @kayit,
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
  SURESI_DOLDU,
  SURE_HATASI,
  mesajOlustur,
  mesajPenceresiAcik,
  disaAktar,
  bildirimGonder,
  mesajDurumu,
};
