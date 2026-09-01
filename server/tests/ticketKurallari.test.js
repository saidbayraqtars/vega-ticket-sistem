const test = require("node:test");
const assert = require("node:assert/strict");
const { ucretCevir, tarihCevir, rvCevir } = require("../lib/ticketKurallari");

test("Ücret Türkçe ve noktalı ondalık biçimlerden çevrilir", () => {
  assert.equal(ucretCevir("1.500,50"), 1500.5);
  assert.equal(ucretCevir("1500,50"), 1500.5);
  assert.equal(ucretCevir("1500.50"), 1500.5);
  assert.equal(ucretCevir("1,500.50"), 1500.5);
  assert.equal(ucretCevir("1.500"), 1500);
  assert.equal(ucretCevir(42.25), 42.25);
});

test("Geçersiz ücret sessizce sıfıra dönüşmez", () => {
  for (const value of ["abc", "12,345", "1.2.3,45", "-1", "1,2345", Number.NaN]) {
    assert.equal(ucretCevir(value), null, String(value));
  }
});

test("API tarihi yalnız YYYY-MM-DD kabul eder", () => {
  const d = tarihCevir("2026-09-01");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 8);
  assert.equal(d.getDate(), 1);
  assert.equal(tarihCevir("2026-02-31"), undefined);
  assert.equal(tarihCevir("01.09.2026"), undefined);
  assert.equal(tarihCevir(""), null);
});

test("ROWVERSION tam 8 bayt hex olmalıdır", () => {
  assert.equal(rvCevir("00000000000000ff").length, 8);
  assert.equal(rvCevir("ff"), null);
  assert.equal(rvCevir("zzzzzzzzzzzzzzzz"), null);
});
