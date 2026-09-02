const test = require("node:test");
const assert = require("node:assert/strict");
const { hesaplaMusteriSuresi } = require("../lib/musteriSuresi");

test("uygulama süresi Vega alanlarının önüne geçer", () => {
  const sonuc = hesaplaMusteriSuresi(
    { KOD1: "YENİ MÜŞTERİ", FAKS: "0362 000 00 00" },
    { BASLANGICTARIHI: new Date(2026, 8, 1), SUREAY: 3 },
    new Date(2026, 8, 15)
  );
  assert.equal(sonuc.kaynak, "uygulama");
  assert.equal(sonuc.sureAy, 3);
  assert.equal(sonuc.bitisISO, "2026-12-01");
  assert.equal(sonuc.rozet, "aktif");
});

test("anlaşmalı müşteride eski uygulama kaydı yok sayılır ve süre 12 aydır", () => {
  const sonuc = hesaplaMusteriSuresi(
    { KOD1: "anlaşma", FAKS: "01.09.2026" },
    { BASLANGICTARIHI: new Date(2026, 8, 1), SUREAY: 2 },
    new Date(2026, 8, 2)
  );
  assert.equal(sonuc.kaynak, "vega");
  assert.equal(sonuc.tur, "ANLAŞMALI");
  assert.equal(sonuc.sureAy, 12);
  assert.equal(sonuc.sureTanimlanabilir, false);
});

test("1-12 ay dışındaki kayıt Vega kuralına düşer", () => {
  const sonuc = hesaplaMusteriSuresi(
    { KOD1: "ANLAŞMALI", FAKS: "01.09.2026" },
    { BASLANGICTARIHI: new Date(2026, 8, 1), SUREAY: 13 },
    new Date(2026, 8, 2)
  );
  assert.equal(sonuc.kaynak, "vega");
  assert.equal(sonuc.sureAy, 12);
});

test("ay sonu taşmadan hesaplanır", () => {
  const sonuc = hesaplaMusteriSuresi(
    { KOD1: "YENİ MÜŞTERİ" },
    { BASLANGICTARIHI: new Date(2026, 0, 31), SUREAY: 1 },
    new Date(2026, 0, 31)
  );
  assert.equal(sonuc.bitisISO, "2026-02-28");
});
