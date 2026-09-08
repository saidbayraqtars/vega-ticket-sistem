const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../lib/db");
const cariCache = require("../lib/cariCache");
const whatsappBildirim = require("../lib/whatsappBildirim");
const whatsappWorker = require("../lib/whatsappWorker");

let sorgular = [];
let whatsappCagrilari = [];
let uyandirma = 0;

function sahteIstek() {
  const girdiler = {};
  return {
    input(ad, _tur, deger) {
      girdiler[ad] = deger;
      return this;
    },
    async query(metin) {
      sorgular.push({ metin, girdiler: { ...girdiler } });
      if (metin.includes("INSERT INTO dbo.TICKETLER")) {
        return { recordset: [{
          ID: 17,
          FIRMANO: girdiler.firma,
          DONEMNO: girdiler.donem,
          CARIIND: girdiler.cari,
          CARIADI: girdiler.cariadi,
          BASLIK: girdiler.baslik,
          DURUM: "ONAY_BEKLIYOR",
          ACILISTARIHI: new Date("2026-09-08T10:00:00+03:00"),
          KAPANISTARIHI: null,
          WHATSAPPMETNI: girdiler.whatsapp,
          UCRET: girdiler.ucret,
          SILINDI: false,
          RV: Buffer.alloc(8),
        }] };
      }
      if (metin.includes("DURUM = 'KAPALI', KAPANISTARIHI = GETDATE()")) {
        return { recordset: [{
          ID: girdiler.id,
          DURUM: "KAPALI",
          KAPANISTARIHI: new Date("2026-09-08T10:05:00+03:00"),
          SILINDI: false,
          RV: Buffer.from("0000000000000001", "hex"),
        }] };
      }
      if (metin.includes("SELECT TOP") && metin.includes("@@DBTS")) {
        return { recordsets: [[], [{ SONRV: Buffer.from("0000000000000002", "hex") }]] };
      }
      return { recordset: [], rowsAffected: [1] };
    },
  };
}

db.ticket = () => ({ request: sahteIstek });
cariCache.al = async () => ({ rows: [{ IND: 9, FIRMAKODU: "C-9", AD: "Test Cari", GSM: "05321234567" }] });
whatsappBildirim.bildirimGonder = async (...args) => {
  whatsappCagrilari.push(args);
  return { ticketId: 17, durum: "BEKLIYOR", sirada: true, metin: args[2].metin };
};
whatsappWorker.uyandir = () => { uyandirma += 1; };

const router = require("../routes/ticket");

function rota(method, path) {
  return router.stack.find((katman) => katman.route?.path === path && katman.route.methods[method])
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

test("yeni ticket onay beklerken düzenlenen WhatsApp metni hemen kuyruğa alınır", async () => {
  sorgular = [];
  whatsappCagrilari = [];
  uyandirma = 0;
  const sonuc = await calistir(rota("post", "/"), {
    kullanici: "Said",
    body: {
      FIRMANO: "103", DONEMNO: "1", CARIIND: 9,
      BASLIK: "Yazıcı kuruldu", UCRET: "250", WHATSAPPSABLONU: "Sayın {firma}, {islem}: {ucret} TL",
    },
  });

  assert.equal(sonuc.durum, 201);
  assert.equal(sonuc.govde.kayit.DURUM, "ONAY_BEKLIYOR");
  assert.equal(whatsappCagrilari.length, 1);
  assert.equal(whatsappCagrilari[0][2].metin, "Sayın Test Cari, Yazıcı kuruldu: 250,00 TL");
  assert.equal(whatsappCagrilari[0][2].kayitTarihi, sonuc.govde.kayit.ACILISTARIHI);
  assert.equal(uyandirma, 1);
});

test("patron onayı yalnız takip durumunu tamamlar, ikinci WhatsApp göndermez", async () => {
  whatsappCagrilari = [];
  const sonuc = await calistir(rota("post", "/:id/onayla"), {
    params: { id: "17" },
    kullanici: "Patron",
  });

  assert.equal(sonuc.durum, 200);
  assert.equal(sonuc.govde.kayit.DURUM, "KAPALI");
  assert.equal(whatsappCagrilari.length, 0);
});

test("tamamlanan işlemler sorgusu seçilen ayın dışındaki kayıtları getirmez", async () => {
  sorgular = [];
  const sonuc = await calistir(rota("get", "/"), {
    query: { firma: "103", durum: "KAPALI", ay: "2026-09" },
  });

  assert.equal(sonuc.durum, 200);
  assert.equal(sonuc.govde.sonRv, "0000000000000002");
  assert.equal(sorgular[0].girdiler.ay, "2026-09");
  assert.match(sorgular[0].metin, /KAPANISTARIHI >=/);
  assert.match(sorgular[0].metin, /DATEADD\(MONTH, 1/);
});
