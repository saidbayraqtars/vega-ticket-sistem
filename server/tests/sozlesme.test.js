const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeTur,
  parseSozlesmeTarihi,
  ayEkle,
  hesaplaSozlesme,
  isoFmt,
} = require("../lib/sozlesme");

test("Türkçe müşteri türleri normalize edilir", () => {
  assert.equal(normalizeTur(" anlaşmalı "), "ANLAŞMALI");
  assert.equal(normalizeTur("YENI MUSTERI"), "YENİ MÜŞTERİ");
  assert.equal(normalizeTur("120"), null);
});

test("FAKS yalnız katı gg.aa.yyyy biçiminde tarih kabul eder", () => {
  assert.equal(isoFmt(parseSozlesmeTarihi("29.02.2024")), "2024-02-29");
  for (const value of ["1.02.2024", "01/02/2024", "01-02-2024", "2024-02-01", "31.02.2024", "0362 266 93 97", "02247130355"]) {
    assert.equal(parseSozlesmeTarihi(value), null, value);
  }
});

test("Ay ekleme ay sonunu taşırmaz", () => {
  assert.equal(isoFmt(ayEkle(new Date(2024, 0, 31), 1)), "2024-02-29");
  assert.equal(isoFmt(ayEkle(new Date(2025, 0, 31), 1)), "2025-02-28");
});

test("Sözleşme rozetleri sabit tarihle doğru hesaplanır", () => {
  const bugun = new Date(2026, 8, 1);
  assert.equal(hesaplaSozlesme({ KOD1: "ANLAŞMALI", FAKS: "11.12.2024" }, bugun).rozet, "doldu");
  assert.equal(hesaplaSozlesme({ KOD1: "ANLAŞMALI", FAKS: "01.09.2026" }, bugun).rozet, "aktif");
  assert.equal(hesaplaSozlesme({ KOD1: "YENİ MÜŞTERİ", FAKS: "01.03.2026" }, bugun).rozet, "bitiyor");
  assert.equal(hesaplaSozlesme({ KOD1: "ANLAŞMALI", FAKS: "02247130355" }, bugun).rozet, "yok");
});
