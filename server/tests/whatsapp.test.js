const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeTelefon, telefonKolonuMu, telefonKolonlariniSirala, cariTelefonu } = require("../lib/telefon");
const { MESAJ_PENCERESI_DAKIKA, SURESI_DOLDU, SURE_HATASI, mesajOlustur, mesajMetniCevir, mesajSablonuDogrula, mesajSablonuDoldur, mesajPenceresiAcik, bildirimGonder, disaAktar } = require("../lib/whatsappBildirim");
const whatsappWorker = require("../lib/whatsappWorker");
const hiz = require("../lib/whatsappHiz");

const HIZSIZ = { aralikBekle: async () => {}, kaydet: () => {} };

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

test("Vega cari telefon kolonları keşfedilir ve TELEFON2/3 yedekleri kullanılır", () => {
  assert.deepEqual(
    telefonKolonlariniSirala(["FAKS", "TELEFON3", "YTELEFON1", "TELEFON1", "TELEFON2", "KEFILTELEFON"]),
    ["TELEFON1", "TELEFON2", "TELEFON3", "YTELEFON1"]
  );
  assert.equal(telefonKolonuMu("FAKS"), false);
  assert.equal(cariTelefonu({ TELEFON1: "0362 111 22 33", TELEFON2: "0533 222 33 44" }), "905332223344");
  assert.equal(cariTelefonu({ TELEFON3: "0544 555 66 77" }), "905445556677");
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

test("bildirim carinin farklı en çok üç cep numarasına gider", () => {
  const { cariTelefonlari } = require("../lib/telefon");
  assert.deepEqual(
    cariTelefonlari({
      TELEFON1: "0362 111 22 33 / 0532 111 22 33",
      TELEFON2: "0533 222 33 44",
      TELEFON3: "+90 532 111 22 33",
      YGSM: "0544 555 66 77",
      YTELEFON1: "0505 999 88 77",
    }),
    ["905321112233", "905332223344", "905445556677"]
  );
  assert.deepEqual(cariTelefonlari({ TELEFON1: "0362 111 22 33" }), []);
});

test("çok numaralı kuyruk kaydı istemciye numaralarıyla döner", () => {
  const sonuc = disaAktar({ TICKETID: 1, DURUM: "GONDERILDI", TELEFON: "905321112233", TELEFONLAR: "905321112233,905332223344" });
  assert.deepEqual(sonuc.telefonlar, ["905321112233", "905332223344"]);
  assert.match(sonuc.mesaj, /2 numaraya/);
  // Eski sürümün yazdığı tek numaralı kayıt da okunur.
  assert.deepEqual(disaAktar({ TICKETID: 2, DURUM: "BEKLIYOR", TELEFON: "905321112233" }).telefonlar, ["905321112233"]);
});

test("yarıda kalan gönderim tekrarlanınca mesaj giden numaraya ikinci kez gitmez", async () => {
  const gidenler = [];
  const ilerlemeler = [];
  const mesaj = { ID: 7, METIN: "Merhaba", TELEFONLAR: "905321112233,905332223344,905445556677", GONDERILENLER: "905321112233" };
  const gonder = async (telefon) => {
    gidenler.push(telefon);
    return telefon === "905445556677" ? { gonderildi: false, mesaj: "Bu numara WhatsApp kullanmıyor." } : { gonderildi: true, mesajId: "m1" };
  };
  const sonuc = await whatsappWorker.mesajiGonder(mesaj, gonder, async (_id, liste) => ilerlemeler.push([...liste]), HIZSIZ);
  assert.deepEqual(gidenler, ["905332223344", "905445556677"]);
  assert.deepEqual(ilerlemeler, [["905321112233", "905332223344"]]);
  assert.equal(sonuc.gonderildi, false);
  assert.match(sonuc.mesaj, /2\/3 numaraya gönderildi/);
  assert.match(sonuc.mesaj, /0544/);

  const tamam = await whatsappWorker.mesajiGonder({ ...mesaj, GONDERILENLER: "905321112233,905332223344" }, async () => ({ gonderildi: true, mesajId: "m2" }), async () => {}, HIZSIZ);
  assert.deepEqual(tamam, { gonderildi: true, mesajId: "m2" });
  const numarasiz = await whatsappWorker.mesajiGonder({ ID: 8, METIN: "x" }, gonder, async () => {}, HIZSIZ);
  assert.equal(numarasiz.gonderildi, false);
});

test("hız sınırı numaralar arasında aralık bırakır", () => {
  const simdi = 10_000_000;
  assert.deepEqual(hiz.beklemeHesapla([], simdi), { ms: 0, neden: null });
  assert.deepEqual(hiz.beklemeHesapla([simdi - 5000], simdi, { sonrakiAralik: 30000 }), { ms: 25000, neden: "aralik" });
  assert.deepEqual(hiz.beklemeHesapla([simdi - 31000], simdi, { sonrakiAralik: 30000 }), { ms: 0, neden: null });
});

test("saatlik sınır, mesajın tüm numaralarına yer açılana kadar bekletir", () => {
  const simdi = 100 * 60 * 60 * 1000;
  // Son bir saatte 28 gönderim: üç numaralı mesaj için 1 fazla.
  const zamanlar = Array.from({ length: hiz.SAATLIK - 2 }, (_, i) => simdi - 50 * 60 * 1000 + i * 1000);
  const sonuc = hiz.beklemeHesapla(zamanlar, simdi, { adet: 3, sonrakiAralik: 0 });
  assert.equal(sonuc.neden, "saatlik");
  assert.equal(sonuc.ms, 10 * 60 * 1000);
  assert.match(hiz.sinirNotu(sonuc, simdi), /Saatlik 30 gönderim sınırı doldu/);
  assert.equal(hiz.beklemeHesapla(zamanlar, simdi, { adet: 2, sonrakiAralik: 0 }).neden, null);
});

test("günlük sınır saatlikten önce denetlenir", () => {
  const simdi = 100 * 60 * 60 * 1000;
  const zamanlar = Array.from({ length: hiz.GUNLUK }, (_, i) => simdi - 20 * 60 * 60 * 1000 + i * 60 * 1000);
  const sonuc = hiz.beklemeHesapla(zamanlar, simdi, { adet: 1, sonrakiAralik: 0 });
  assert.equal(sonuc.neden, "gunluk");
  assert.equal(sonuc.ms, 4 * 60 * 60 * 1000);
  assert.equal(hiz.sinirNotu({ ms: 1000, neden: "aralik" }), null);
});

test("mesaj gönderimi her numaradan önce aralık bekler ve her denemeyi sayar", async () => {
  const olaylar = [];
  const hizlar = { aralikBekle: async () => olaylar.push("bekle"), kaydet: () => olaylar.push("say") };
  await whatsappWorker.mesajiGonder(
    { ID: 9, METIN: "x", TELEFONLAR: "905321112233,905332223344" },
    async (t) => { olaylar.push(t); return { gonderildi: t !== "905332223344", mesaj: "yok" }; },
    async () => {},
    hizlar
  );
  assert.deepEqual(olaylar, ["bekle", "905321112233", "say", "bekle", "905332223344", "say"]);
});

test("kısıtlanan, kapatılan ya da başka yerde açılan oturuma otomatik bağlanılmaz", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { DURDURAN_KODLAR } = require("../lib/whatsapp");
  assert.deepEqual(Object.keys(DURDURAN_KODLAR).map(Number).sort(), [401, 403, 440]);
  const kaynak = fs.readFileSync(path.join(__dirname, "..", "lib", "whatsapp.js"), "utf8");
  assert.ok(kaynak.includes("if (hazir || baslatiliyor || socket || durdurmaOku()) return durum();"));
  assert.ok(kaynak.includes("DisconnectReason.forbidden"));
});

test("numara kaydı önbellekten okunur, süresi dolunca yeniden sorulur", () => {
  const wa = require("../lib/whatsapp");
  const simdi = 1_000_000_000;
  wa.kayitOnbellek.set("905321112233", { exists: true, jid: "x@s.whatsapp.net", zaman: simdi });
  wa.kayitOnbellek.set("905332223344", { exists: false, jid: null, zaman: simdi });
  assert.equal(wa.onbellektenKayit("905321112233", simdi + wa.KAYIT_YOK_MS).exists, true);
  assert.equal(wa.onbellektenKayit("905332223344", simdi + wa.KAYIT_YOK_MS - 1).exists, false);
  assert.equal(wa.onbellektenKayit("905332223344", simdi + wa.KAYIT_YOK_MS), null);
  assert.equal(wa.onbellektenKayit("905321112233", simdi + wa.KAYIT_VAR_MS), null);
  assert.equal(wa.kayitOnbellek.size, 0);
});
