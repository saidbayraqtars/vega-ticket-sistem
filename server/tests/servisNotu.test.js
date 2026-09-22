const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { notNormalize, tutarCevir, NOT_EN_FAZLA_KARAKTER } = require("../lib/servisNotu");

test("tutar Türkçe ve düz yazımla aynı sayıya çözülür", () => {
  assert.equal(tutarCevir("1.250,00").tutar, 1250);
  assert.equal(tutarCevir("1250,5").tutar, 1250.5);
  assert.equal(tutarCevir("1250.5").tutar, 1250.5);
  assert.equal(tutarCevir("2.500 TL").tutar, 2500);
  assert.equal(tutarCevir(1250.456).tutar, 1250.46);
});

test("tutar boş bırakılabilir, eksi ve sayı olmayan kabul edilmez", () => {
  assert.equal(tutarCevir("").tutar, null);
  assert.equal(tutarCevir(null).tutar, null);
  assert.equal(tutarCevir("   ").tutar, null);
  assert.match(tutarCevir("-50").hata, /eksi/);
  assert.match(tutarCevir("1,2,3").hata, /sayı/);
  assert.match(tutarCevir("99999999999999999").hata, /çok büyük/);
});

test("not metni zorunlu, tür beyaz listeden gelir", () => {
  assert.match(notNormalize({ METIN: "   " }).hata, /boş olamaz/);
  assert.match(notNormalize({ TUR: "MUSTERIYE", METIN: "x" }).hata, /NOT, TEKLIF veya ISLEM/);
  const { tur, metin, tutar } = notNormalize({ TUR: "teklif", METIN: "  1.500 teklif verildi  ", TUTAR: "1.500,00" });
  assert.equal(tur, "TEKLIF");
  assert.equal(metin, "1.500 teklif verildi");
  assert.equal(tutar, 1500);
  assert.equal(notNormalize({ METIN: "not" }).tur, "NOT");
  assert.equal(notNormalize({ METIN: "not" }).tutar, null);
  assert.equal(notNormalize({ METIN: "a".repeat(5000) }).metin.length, NOT_EN_FAZLA_KARAKTER);
});

test("şirket içi not WhatsApp kuyruğuna hiç girmez", () => {
  const rota = fs.readFileSync(path.join(__dirname, "../routes/servis.js"), "utf8");
  const notBolumu = rota.slice(rota.indexOf("/notlar"), rota.indexOf("PATCH /api/servis/:id"));
  assert.ok(!/WHATSAPPMESAJLARI/.test(notBolumu), "not uçları WhatsApp tablosuna yazmamalı");
  assert.match(rota, /INSERT INTO dbo\.SERVISNOTLARI/);
});

test("not uçları /:id kalıbından önce tanımlanır", () => {
  const rota = fs.readFileSync(path.join(__dirname, "../routes/servis.js"), "utf8");
  assert.ok(rota.indexOf(`router.patch("/not/:id"`) < rota.indexOf(`router.patch("/:id"`));
  assert.ok(rota.indexOf(`router.delete("/not/:id"`) < rota.indexOf(`router.delete("/:id"`));
});

test("servis kaydının carisi sonradan değiştirilebilir", () => {
  const rota = fs.readFileSync(path.join(__dirname, "../routes/servis.js"), "utf8");
  assert.match(rota, /Object\.hasOwn\(b, "CARIIND"\)/);
  // Ad ve kod carinin kartından alınır; istemcinin gönderdiği metin yazılmaz.
  assert.match(rota, /CARIIND = @cariind", "CARIKODU = @carikodu", "CARIADI = @cariadi/);
  assert.match(rota, /input\("cariadi", sql\.NVarChar\(255\), kart\.AD/);
});

test("not tablosu şemada tür kısıtıyla kurulur", () => {
  const sema = fs.readFileSync(path.join(__dirname, "../lib/db.js"), "utf8");
  assert.match(sema, /CREATE TABLE dbo\.SERVISNOTLARI/);
  assert.match(sema, /CK_SERVISNOTLARI_TUR CHECK \(TUR IN \('NOT','TEKLIF','ISLEM'\)\)/);
});
