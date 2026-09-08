const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const servis = require("../routes/servis");

test("şehir dışı servis kaydı KARGODA durumuna geçirilebilir", () => {
  assert.ok(servis.DURUMLAR.includes("KARGODA"));
});

test("mevcut servis ve cihaz durum kısıtları KARGODA için yükseltilir", () => {
  const dbKaynagi = fs.readFileSync(path.join(__dirname, "../lib/db.js"), "utf8");

  assert.match(dbKaynagi, /CK_SERVISKAYITLARI_DURUM[\s\S]+KARGODA/);
  assert.match(dbKaynagi, /CK_CIHAZLAR_DURUM[\s\S]+KARGODA/);
});
