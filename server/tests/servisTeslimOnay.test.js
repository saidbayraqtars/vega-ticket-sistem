const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../lib/db");

let sorgular = [];
let guncellenen = 1;

function sahteIstek() {
  const girdiler = {};
  return {
    input(ad, _tur, deger) {
      girdiler[ad] = deger;
      return this;
    },
    async query(metin) {
      sorgular.push({ metin, girdiler: { ...girdiler } });
      if (metin.includes("UPDATE dbo.SERVISKAYITLARI")) {
        return { recordset: guncellenen ? [{ ID: girdiler.id }] : [] };
      }
      if (metin.includes("FROM dbo.SERVISKAYITLARI WHERE ID = @id")) {
        return { recordset: [{ ID: girdiler.id, SERVISNO: "SRV-000005", DURUM: "TESLIM", ONAYTARIHI: null, RV: Buffer.alloc(8) }] };
      }
      return { recordset: [] };
    },
  };
}

db.ticket = () => ({ request: sahteIstek });
const servis = require("../routes/servis");

function rota(method, path) {
  return servis.stack.find((katman) => katman.route?.path === path && katman.route.methods[method])
    .route.stack[0].handle;
}

async function calistir(handler, req) {
  let durum = 200;
  let govde;
  const res = {
    status(kod) { durum = kod; return this; },
    json(veri) { govde = veri; return this; },
  };
  await handler(req, res, (err) => { if (err) throw err; });
  return { durum, govde };
}

test("teslim edilenler onay durumuna göre iki sekmeye bölünür", () => {
  assert.equal(servis.ONAY_KOSULU.teslimOnay, "ONAYTARIHI IS NULL");
  assert.equal(servis.ONAY_KOSULU.teslim, "ONAYTARIHI IS NOT NULL");
});

test("onay bekleyen teslim çift tıklamayla onaylanır", async () => {
  sorgular = [];
  guncellenen = 1;
  const sonuc = await calistir(rota("post", "/:id/onayla"), { params: { id: "5" }, kullanici: "Patron" });

  assert.equal(sonuc.durum, 200);
  assert.match(sorgular[0].metin, /ONAYLAYAN = @kullanici, ONAYTARIHI = GETDATE\(\)/);
  assert.match(sorgular[0].metin, /DURUM = 'TESLIM'\s+AND ONAYTARIHI IS NULL/);
  assert.equal(sorgular[0].girdiler.kullanici, "Patron");
});

test("onaylanan teslim onaya geri alınır", async () => {
  sorgular = [];
  guncellenen = 1;
  const sonuc = await calistir(rota("post", "/:id/geri-al"), { params: { id: "5" }, kullanici: "Patron" });

  assert.equal(sonuc.durum, 200);
  assert.match(sorgular[0].metin, /ONAYLAYAN = NULL, ONAYTARIHI = NULL/);
  assert.match(sorgular[0].metin, /AND ONAYTARIHI IS NOT NULL/);
});

test("başka kullanıcı önce onayladıysa 409 ve güncel kayıt döner", async () => {
  sorgular = [];
  guncellenen = 0;
  const sonuc = await calistir(rota("post", "/:id/onayla"), { params: { id: "5" }, kullanici: "Patron" });

  assert.equal(sonuc.durum, 409);
  assert.equal(sonuc.govde.kayit.ID, 5);
  assert.match(sonuc.govde.mesaj, /zaten onaylandı/);
});

test("durum değişince teslim onayı düşer", async () => {
  sorgular = [];
  guncellenen = 1;
  await calistir(rota("patch", "/:id"), {
    params: { id: "5" }, kullanici: "Said", body: { RV: "0000000000000001", DURUM: "TESLIM" },
  });
  assert.match(sorgular[0].metin, /ONAYLAYAN = NULL, ONAYTARIHI = NULL/);
});
