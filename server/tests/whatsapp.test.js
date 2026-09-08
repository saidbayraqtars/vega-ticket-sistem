const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeTelefon, cariTelefonu } = require("../lib/telefon");
const { MESAJ_PENCERESI_DAKIKA, SURESI_DOLDU, SURE_HATASI, mesajOlustur, mesajMetniCevir, mesajSablonuDogrula, mesajSablonuDoldur, mesajPenceresiAcik, bildirimGonder, disaAktar } = require("../lib/whatsappBildirim");
const whatsappWorker = require("../lib/whatsappWorker");

test("Türkiye cep telefonları WhatsApp biçimine çevrilir", () => {
  assert.equal(normalizeTelefon("0532 123 45 67"), "905321234567");
  assert.equal(normalizeTelefon("+90 (535) 123-45-67"), "905351234567");
  assert.equal(normalizeTelefon("5321234567 / 05339998877"), "905321234567");
  assert.equal(normalizeTelefon("0362 123 45 67"), "");
});

test("Cari telefonunda GSM, TELEFON1 alanından önce gelir", () => {
  assert.equal(cariTelefonu({ GSM: "0544 111 22 33", TELEFON1: "0532 999 88 77" }), "905441112233");
  assert.equal(cariTelefonu({ GSM: "", TELEFON1: "0532 999 88 77" }), "905329998877");
});

test("WhatsApp metni yapılan işlemi ve uzak bağlantı bilgisini içerir", () => {
  const mesaj = mesajOlustur("Yazıcı kurulumu");
  assert.match(mesaj, /Yazıcı kurulumu/);
  assert.match(mesaj, /uzak bağlantı/);
  assert.match(mesaj, /çözülmüştür/);
});

test("Düzenlenen WhatsApp taslağı aynen kullanılır ve uzun metin reddedilir", () => {
  assert.equal(mesajMetniCevir("  Özel mesaj  ", "İşlem"), "Özel mesaj");
  assert.equal(mesajMetniCevir("", "Yazıcı kurulumu"), mesajOlustur("Yazıcı kurulumu"));
  assert.equal(mesajMetniCevir("x".repeat(1001), "İşlem"), null);
});

test("WhatsApp şablonu desteklenen değişkenleri gerçek işlem bilgileriyle doldurur", () => {
  const mesaj = mesajSablonuDoldur("Sayın {firma}, {kod}: {islem} / {ucret} TL / {kullanici}", {
    musteri: "Örnek Ltd.", cariKodu: "C-12", islem: "Kurulum", ucret: 1250.5, kullanici: "Said",
  });
  assert.equal(mesaj, "Sayın Örnek Ltd., C-12: Kurulum / 1.250,50 TL / Said");
  assert.equal(mesajSablonuDogrula("Bilinmeyen {telefon}"), null);
  assert.equal(mesajSablonuDogrula("Merhaba {firma}"), "Merhaba {firma}");
});

test("WhatsApp yalnız ticketın ilk 30 dakikasında gönderilebilir", () => {
  const kayit = new Date("2026-09-01T10:00:00+03:00");
  assert.equal(mesajPenceresiAcik(kayit, new Date("2026-09-01T10:29:59+03:00")), true);
  assert.equal(mesajPenceresiAcik(kayit, new Date("2026-09-01T10:30:00+03:00")), false);
  assert.equal(mesajPenceresiAcik(kayit, new Date("2026-09-01T09:59:59+03:00")), false);
  assert.equal(mesajPenceresiAcik("geçersiz", new Date()), false);
});

test("30 dakikası dolan bildirim WhatsApp servisine gitmeden iptal edilir", async () => {
  const sonuc = await bildirimGonder(
    { GSM: "0532 123 45 67" },
    "Yazıcı kurulumu",
    {
      kayitTarihi: new Date("2026-09-01T10:00:00+03:00"),
      simdi: new Date("2026-09-01T10:30:00+03:00"),
    }
  );
  assert.equal(sonuc.gonderildi, false);
  assert.equal(sonuc.iptal, true);
  assert.match(sonuc.mesaj, /30 dakika/);
});

test("merkezi kuyruk durumları istemci sonucuna çevrilir", () => {
  assert.equal(disaAktar({ TICKETID: 1, DURUM: "BEKLIYOR" }).sirada, true);
  assert.equal(disaAktar({ TICKETID: 1, DURUM: "GONDERILDI" }).gonderildi, true);
  assert.equal(disaAktar({ TICKETID: 1, DURUM: "IPTAL" }).iptal, true);
});

test("ana makine adı büyük küçük harften bağımsız eşleşir", () => {
  assert.equal(whatsappWorker.buMakineAna({ ANAMAKINE: whatsappWorker.MAKINE.toUpperCase() }), true);
  assert.equal(whatsappWorker.buMakineAna({ ANAMAKINE: "BASKA-BILGISAYAR" }), false);
});


test("gönderim penceresi SQL'de de tek sabitten üretilir", () => {
  assert.ok(SURESI_DOLDU.includes(`DATEADD(MINUTE, ${MESAJ_PENCERESI_DAKIKA}, KAYITTARIHI)`));
  assert.ok(SURE_HATASI.startsWith(`${MESAJ_PENCERESI_DAKIKA} dakika`));
});

test("takılan talep eşiği tek gönderimin sürebileceği süreden uzundur", () => {
  // onWhatsApp + sendMessage her biri 60 sn'ye kadar bekleyebilir; eşik bunun
  // altında kalırsa uçuştaki satır kuyruğa döner ve müşteriye ikinci mesaj gider.
  assert.ok(whatsappWorker.TAKILDI_DAKIKA * 60 > 120);
  assert.ok(whatsappWorker.TAKILDI_DAKIKA < MESAJ_PENCERESI_DAKIKA);
});

test("kuyruk tazeleme, ana makinenin gönderdiği satırı ezmez", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const kaynak = fs.readFileSync(path.join(__dirname, "..", "lib", "whatsappBildirim.js"), "utf8");
  assert.ok(kaynak.includes("WHEN MATCHED AND H.DURUM IN ('BEKLIYOR', 'HATA')"));
  assert.ok(!kaynak.includes("H.DURUM <> 'GONDERILDI'"));
});

test("kalp atışı tazelik penceresi boştaki yoklama aralığından geniştir", () => {
  // Döngü boşta BOSTA_MS'de bir kalp atışı yazıyor. Tazelik penceresi bunun
  // altına düşerse istemciler ana makineyi boş yere "ulaşılamıyor" gösterir.
  assert.ok(whatsappWorker.YOKLAMA_TAZE_MS > whatsappWorker.BOSTA_MS * 2);
});
