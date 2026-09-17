const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const servisMesaj = require("../lib/servisMesaj");
const { disaAktar, SURE_HATASI } = require("../lib/whatsappBildirim");

const KAYIT = {
  SERVISNO: "SRV-000042",
  CARIADI: "Örnek Bilişim Ltd.",
  CARIKODU: "120.01.001",
  YETKILI: "Ali Veli",
  TELEFON: "0532 111 22 33",
  KABULTARIHI: new Date("2026-09-15T10:00:00+03:00"),
  cihazlar: [
    { CINS: "Yazıcı", MARKA: "HP", MODEL: "M404", SERINO: "SN1" },
    { CINS: "Monitör", MARKA: "", MODEL: "", SERINO: "" },
    { CINS: "Yazıcı", MARKA: "HP", MODEL: "M404", SERINO: "SN2" },
  ],
  gonderimler: [
    { TUR: "KARGO", KARGOFIRMASI: "Aras Kargo", TAKIPNO: "999" },
    { TUR: "ARIZA", KARGOFIRMASI: "MNG Kargo", TAKIPNO: "111" },
  ],
};

test("her servis mesaj türünün geçerli varsayılan şablonu var", () => {
  for (const { kod } of servisMesaj.SERVIS_MESAJ_TURLERI) {
    const sablon = servisMesaj.VARSAYILAN_SERVIS_SABLONLARI[kod];
    assert.ok(servisMesaj.servisSablonuDogrula(sablon), kod);
  }
});

test("servis şablonu kayıt, cihaz ve son gönderim bilgileriyle doldurulur", () => {
  const mesaj = servisMesaj.servisMesajiDoldur(
    "{firma}|{kod}|{servisno}|{cihaz}|{serino}|{yetkili}|{kargo}|{takipno}|{kabultarihi}|{kullanici}",
    KAYIT,
    { kullanici: "Said" },
  );
  assert.equal(mesaj, "Örnek Bilişim Ltd.|120.01.001|SRV-000042|HP M404, Monitör|SN1, SN2|Ali Veli|Aras Kargo|999|15.09.2026|Said");
});

test("servis şablonu işlem kaydına ait veya bilinmeyen değişkeni reddeder", () => {
  assert.equal(servisMesaj.servisSablonuDogrula("Ücret: {ucret}"), null);
  assert.equal(servisMesaj.servisSablonuDogrula("Merhaba {telefon}"), null);
  assert.equal(servisMesaj.servisSablonuDogrula("   "), null);
  assert.equal(servisMesaj.servisSablonuDogrula("x".repeat(1001)), null);
  assert.equal(servisMesaj.servisSablonuDogrula(" Merhaba {firma} "), "Merhaba {firma}");
});

test("numara adayları önce servis kaydından, sonra cari kartından gelir ve tekrarlanmaz", () => {
  const adaylar = servisMesaj.servisTelefonAdaylari(
    { TELEFON: "0532 111 22 33" },
    { TELEFON1: "0362 000 00 00 / 0532 111 22 33", GSM: "0544 555 66 77" },
  );
  assert.deepEqual(adaylar, [
    { telefon: "905321112233", kaynak: "servis" },
    { telefon: "905445556677", kaynak: "cari" },
  ]);
  assert.deepEqual(servisMesaj.servisTelefonAdaylari({ TELEFON: "" }, null), []);
});

test("alıcı numaraları cep olmalı, tekrarlanmaz ve en çok üç olur", () => {
  assert.deepEqual(servisMesaj.aliciTelefonlari(["0532 111 22 33", "+905321112233", "5445556677"]).telefonlar,
    ["905321112233", "905445556677"]);
  assert.match(servisMesaj.aliciTelefonlari(["0362 111 22 33"]).hata, /Geçersiz cep/);
  assert.match(servisMesaj.aliciTelefonlari([]).hata, /en az bir/);
  assert.match(servisMesaj.aliciTelefonlari(["05321112231", "05321112232", "05321112233", "05321112234"]).hata, /en çok 3/);
});

test("kullanıcının iptal ettiği mesaj kendi nedenini, süresi dolan 30 dakika uyarısını gösterir", () => {
  const kullanici = disaAktar({ ID: 5, SERVISID: 3, MESAJTURU: "HAZIR", DURUM: "IPTAL", SONHATA: "Gönderim Ali tarafından iptal edildi." });
  assert.equal(kullanici.mesaj, "Gönderim Ali tarafından iptal edildi.");
  assert.equal(kullanici.servisId, 3);
  assert.equal(kullanici.tur, "HAZIR");
  assert.equal(kullanici.id, 5);
  const sure = disaAktar({ TICKETID: 1, DURUM: "IPTAL", SONHATA: SURE_HATASI });
  assert.match(sure.mesaj, /30 dakika içinde gönderilemediği/);
});

test("servis mesajı için kuyruk TICKETID'yi boş bırakır, tekillik yalnız dolu TICKETID'de aranır", () => {
  const kaynak = fs.readFileSync(path.join(__dirname, "../lib/db.js"), "utf8");
  assert.match(kaynak, /ALTER COLUMN TICKETID INT NULL/);
  assert.match(kaynak, /CREATE UNIQUE INDEX UX_WHATSAPPMESAJLARI_TICKET[\s\S]*WHERE TICKETID IS NOT NULL/);
  // Kısıt, kolon değişmeden önce kaldırılır ve kuyruk indeksi yeniden kurulur.
  const blok = kaynak.slice(kaynak.indexOf("DROP CONSTRAINT UQ_WHATSAPPMESAJLARI_TICKET"));
  assert.ok(blok.indexOf("ALTER COLUMN TICKETID") < blok.indexOf("CREATE INDEX IX_WHATSAPPMESAJLARI_KUYRUK"));
});

test("tekrar gönderim yalnız gönderilmemiş servis mesajında pencereyi yeniden başlatır", () => {
  const kaynak = fs.readFileSync(path.join(__dirname, "../routes/servisWhatsapp.js"), "utf8");
  const tekrar = kaynak.slice(kaynak.indexOf('"/whatsapp/:mesajId/tekrar"'), kaynak.indexOf('"/whatsapp/:mesajId/iptal"'));
  assert.match(tekrar, /KAYITTARIHI = GETDATE\(\)/);
  assert.match(tekrar, /DURUM IN \('HATA','IPTAL'\)/);
  assert.ok(!tekrar.includes("GONDERILENLER ="), "gönderilen numaralar sıfırlanmamalı");
  // Ana bilgisayarın elindeki (GONDERILIYOR) satırı hiçbir güncelleme seçmez.
  const guncellemeler = kaynak.split("UPDATE dbo.WHATSAPPMESAJLARI").slice(1).map((p) => p.slice(0, p.indexOf("`")));
  assert.equal(guncellemeler.length, 3);
  for (const blok of guncellemeler) assert.ok(!blok.includes("GONDERILIYOR"), blok);
});
