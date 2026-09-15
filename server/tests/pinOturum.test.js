const test = require("node:test");
const assert = require("node:assert/strict");

const { pinGecerliMi, pinHashle, pinDogrula, pinVarMi } = require("../lib/pin");
const oturum = require("../lib/oturum");
const { pinKontrol } = require("../routes/kullanici");

test("PIN yalnız 4-6 haneli rakam olabilir", () => {
  for (const pin of ["1234", "12345", "123456"]) assert.equal(pinGecerliMi(pin), true, pin);
  for (const pin of ["123", "1234567", "12a4", " 1234", "", null, 1234]) assert.equal(pinGecerliMi(pin), false, String(pin));
});

test("PIN düz saklanmaz ve yalnız doğru PIN doğrulanır", () => {
  const kayit = pinHashle("4821");
  assert.ok(pinVarMi(kayit));
  assert.ok(!kayit.includes("4821"));
  assert.notEqual(pinHashle("4821"), kayit, "her kayıtta farklı tuz");
  assert.equal(pinDogrula("4821", kayit), true);
  assert.equal(pinDogrula("4822", kayit), false);
  assert.equal(pinDogrula("4821", "bozuk"), false);
  assert.equal(pinVarMi(null), false);
});

test("oturum belirteci kullanıcıyı çözer, kapatılınca geçersiz olur", () => {
  const belirtec = oturum.oturumAc("Said");
  assert.equal(oturum.oturumCoz(belirtec), "Said");
  assert.equal(oturum.oturumCoz("uydurma"), null);
  oturum.oturumKapat(belirtec);
  assert.equal(oturum.oturumCoz(belirtec), null);
});

test("art arda yanlış PIN kullanıcıyı kısa süre kilitler, doğru PIN sayacı sıfırlar", () => {
  const kayit = { KULLANICIADI: "KilitTest", PAROLAHASH: pinHashle("1111") };
  for (let i = 1; i < oturum.ENFAZLA_HATA; i++) {
    const sonuc = pinKontrol(kayit, "0000");
    assert.equal(sonuc.durum, 401);
    assert.equal(sonuc.govde.kalanDeneme, oturum.ENFAZLA_HATA - i);
  }
  assert.equal(pinKontrol(kayit, "0000").durum, 429);
  // Kilitliyken doğru PIN de reddedilir — deneme hızını sınırlamanın amacı bu.
  assert.equal(pinKontrol(kayit, "1111").durum, 429);

  const serbest = { KULLANICIADI: "SerbestTest", PAROLAHASH: pinHashle("2222") };
  pinKontrol(serbest, "0000");
  assert.equal(pinKontrol(serbest, "2222").ok, true);
  assert.equal(oturum.kilitKalan("SerbestTest"), 0);
});

test("PIN'i olmayan kullanıcı PIN sorulmadan geçer", () => {
  assert.equal(pinKontrol({ KULLANICIADI: "Pinsiz", PAROLAHASH: null }, undefined).ok, true);
  assert.equal(pinKontrol(null, undefined).ok, true);
});
