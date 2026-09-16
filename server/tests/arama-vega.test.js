const test = require("node:test");
const assert = require("node:assert/strict");
const arama = require("../lib/arama");
const vega = require("../lib/vega");

test("Türkçe arama normalizasyonu ve yazım önerisi çalışır", () => {
  const rows = [
    { IND: 111, FIRMAKODU: "SİSTEM", AD: "TECHNO SİSTEM BİLGİSAYAR" },
    { IND: 126, FIRMAKODU: "KARTAŞ", AD: "KARTAŞ-TENDA LOJİSTİK" },
  ];
  const indeks = arama.indeksOlustur(rows);
  assert.equal(arama.normalize("İŞ ÇÖZÜMÜ"), "is cozumu");
  assert.equal(arama.ara(indeks, "kartas tenda").sonuclar[0].IND, 126);
  assert.equal(arama.ara(indeks, "techno sistm").oneri.sorgu, "techno sistem");
});

test("müşteri, yetkili ve keşfedilen bütün telefon alanlarıyla aranır", () => {
  const rows = [
    { IND: 10, FIRMAKODU: "C-10", AD: "Örnek Cari", YETKILI: "Ayşe", TELEFON1: "0362 111 22 33", TELEFON3: "0532 765 43 21" },
  ];
  const indeks = arama.indeksOlustur(rows);
  assert.equal(arama.ara(indeks, "ayse").sonuclar[0].IND, 10);
  assert.equal(arama.ara(indeks, "5327654321").sonuclar[0].IND, 10);
});

test("Vega tablo adları firma ve dönemden güvenli üretilir", async () => {
  assert.equal(vega.kartTablosu("103", "CARI"), "F0103TBLCARI");
  assert.equal(vega.hareketTablosu("103", "15", "CARIHAREKETLERI"), "F0103D0015TBLCARIHAREKETLERI");
  await assert.rejects(() => vega.tabloDogrula({}, "F0103TBLCARI];DROP TABLE X--"), /Geçersiz tablo adı/);
});
