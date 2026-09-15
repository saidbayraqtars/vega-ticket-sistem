const test = require("node:test");
const assert = require("node:assert/strict");

const cariListe = require("../lib/cariListe");
const vega = require("../lib/vega");

const kart = (IND, AD, tur, borcDurumu, BAKIYE, rozet = "yok", bitisISO = null) => ({
  IND, AD, FIRMAKODU: `K${IND}`, BAKIYE, borcDurumu,
  sure: { tur, rozet, bitisISO, sureAy: tur === "ANLAŞMALI" ? 12 : null },
});

const liste = [
  kart(1, "Çınar Market", "ANLAŞMALI", "BORCLU", 500, "aktif", "2027-01-01"),
  kart(2, "Akın Gıda", null, "BORCU_YOK", 0),
  kart(3, "İnci Yapı", "YENİ MÜŞTERİ", "ALACAKLI", -20, "doldu", "2026-01-01"),
  kart(4, "Ege Yıldızı", "ANLAŞMALI", "BORCU_YOK", 0, "bitiyor", "2026-10-01"),
];
const adlar = (l) => l.map((x) => x.AD);

test("müşteri listesi yalnız aktif (STATUS=1) kartları alır", () => {
  assert.match(vega.CARI_FILTRE, /C\.STATUS = 1/);
  assert.doesNotMatch(vega.CARI_FILTRE, /ISNULL\(C\.STATUS, 1\)/);
});

test("tür, borç ve süre filtreleri birlikte ve çoklu seçimle çalışır", () => {
  const f = cariListe.filtreCevir({ tur: "ANLAŞMALI,TANIMSIZ", borc: "BORCU_YOK" });
  assert.deepEqual(adlar(cariListe.filtrele(liste, f)), ["Akın Gıda", "Ege Yıldızı"]);
  assert.deepEqual(adlar(cariListe.filtrele(liste, cariListe.filtreCevir({ sure: "doldu" }))), ["İnci Yapı"]);
  // Tanınmayan değer filtre sayılmaz, liste daralmaz.
  assert.equal(cariListe.filtrele(liste, cariListe.filtreCevir({ tur: "UYDURMA" })).length, 4);
});

test("metin filtresi Türkçe karakterden bağımsız eşleşir", () => {
  assert.deepEqual(adlar(cariListe.filtrele(liste, cariListe.filtreCevir({ ara: "cinar" }))), ["Çınar Market"]);
  assert.deepEqual(adlar(cariListe.filtrele(liste, cariListe.filtreCevir({ ad: "İNCİ" }))), ["İnci Yapı"]);
});

test("tüm sütunlar sıralanabilir, bilinmeyen anahtar ada göre sıralar", () => {
  assert.deepEqual(adlar(cariListe.sirala(liste, "ad", "asc")), ["Akın Gıda", "Çınar Market", "Ege Yıldızı", "İnci Yapı"]);
  assert.deepEqual(adlar(cariListe.sirala(liste, "bakiye", "desc")).slice(0, 1), ["Çınar Market"]);
  assert.deepEqual(adlar(cariListe.sirala(liste, "tur", "asc")), ["Çınar Market", "Ege Yıldızı", "Akın Gıda", "İnci Yapı"]);
  assert.deepEqual(adlar(cariListe.sirala(liste, "bitis", "asc")), ["İnci Yapı", "Ege Yıldızı", "Çınar Market", "Akın Gıda"]);
  assert.equal(cariListe.siralamaAnahtari("DROP TABLE"), "ad");
});

test("özet filtrelenmiş listedeki dağılımı sayar", () => {
  const ozet = cariListe.ozet(liste);
  assert.equal(ozet.tur["ANLAŞMALI"], 2);
  assert.equal(ozet.tur.TANIMSIZ, 1);
  assert.equal(ozet.borc.BORCU_YOK, 2);
});
