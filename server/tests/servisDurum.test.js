const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const db = require("../lib/db");
const servis = require("../routes/servis");

test("arızaya gönderilen ve kargoya verilen ayrı durumlardır", () => {
  assert.ok(servis.DURUMLAR.includes("ARIZADA"));
  assert.ok(servis.DURUMLAR.includes("KARGODA"));
  assert.deepEqual(servis.GRUPLAR.ariza, ["ARIZADA"]);
  assert.deepEqual(servis.GRUPLAR.kargo, ["KARGODA"]);
  assert.equal(servis.GONDERIM_DURUMU.ARIZA, "ARIZADA");
  assert.equal(servis.GONDERIM_DURUMU.KARGO, "KARGODA");
});

test("açık servis listesi gönderilen, teslim ve iptal kayıtlarını içermez", () => {
  for (const durum of ["ARIZADA", "KARGODA", "TESLIM", "IPTAL"]) {
    assert.ok(!servis.GRUPLAR.acik.includes(durum), durum);
  }
  // Her durum tam olarak bir sekmede görünür.
  const tumu = Object.values(servis.GRUPLAR).flat();
  assert.deepEqual([...tumu].sort(), [...db.SERVIS_DURUMLARI].sort());
});

test("durum kısıtları tek listeden kurulur ve eski kurulumlar yükseltilir", () => {
  const kaynak = fs.readFileSync(path.join(__dirname, "../lib/db.js"), "utf8");
  assert.match(kaynak, /durumKisitiYukselt\("SERVISKAYITLARI", "CK_SERVISKAYITLARI_DURUM"\)/);
  assert.match(kaynak, /durumKisitiYukselt\("CIHAZLAR", "CK_CIHAZLAR_DURUM"\)/);
  assert.ok(!kaynak.includes("'HAZIR','KARGODA'"), "sabit yazılmış eski durum listesi kalmamalı");
});

test("gönderim alıcı adı olmadan ve bilinmeyen türle kabul edilmez", () => {
  assert.match(servis.gonderimNormalize({ TUR: "ARIZA" }).hata, /Alıcı adı/);
  assert.match(servis.gonderimNormalize({ TUR: "POSTA", ALICIADI: "X" }).hata, /ARIZA veya KARGO/);
  const { tur, alanlar } = servis.gonderimNormalize({ TUR: "kargo", ALICIADI: "  Müşteri A.Ş. ", TAKIPNO: "" });
  assert.equal(tur, "KARGO");
  assert.equal(alanlar.ALICIADI, "Müşteri A.Ş.");
  assert.equal(alanlar.TAKIPNO, null);
});
