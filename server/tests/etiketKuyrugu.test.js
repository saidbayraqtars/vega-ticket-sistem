const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const etiket = require("../lib/etiket");
const kuyruk = require("../lib/etiketKuyrugu");

test("etiket yalnız başka bilgisayar seçiliyse kuyruğa gider", () => {
  assert.equal(kuyruk.uzakHedef({ hedefMakine: "" }, "KASA"), null);
  assert.equal(kuyruk.uzakHedef({ hedefMakine: "  " }, "KASA"), null);
  assert.equal(kuyruk.uzakHedef({ hedefMakine: "DEPO-PC" }, "KASA"), "DEPO-PC");
  // Kendini seçen bilgisayar kendi yazıcısına basar (büyük/küçük harf fark etmez).
  assert.equal(kuyruk.uzakHedef({ hedefMakine: "kasa" }, "KASA"), null);
  // Yazıcısını paylaşan bilgisayar işleri başka yere göndermez; döngü olmaz.
  assert.equal(kuyruk.uzakHedef({ hedefMakine: "DEPO-PC", paylas: true }, "KASA"), null);
});

test("paylaşım ve hedef ayarı normalize edilir", () => {
  const ayar = etiket.ayarNormalize({ paylas: "evet", hedefMakine: `  ${"X".repeat(200)} ` });
  assert.equal(ayar.paylas, true);
  assert.equal(ayar.hedefMakine.length, 128);
  assert.equal(etiket.ayarNormalize({}).paylas, false);
  assert.equal(etiket.ayarNormalize({}).hedefMakine, "");
});

test("iş durumu kullanıcıya okunur mesajla döner", () => {
  const temel = { ID: 7, HEDEFMAKINE: "DEPO-PC", TUR: "SERVIS", ADET: 3, GONDEREN: "Ali" };
  const sirada = kuyruk.isDisaAktar({ ...temel, DURUM: "BEKLIYOR" });
  assert.equal(sirada.sirada, true);
  // mssql BIGINT'i metin döndürür; istemciye sayı gider.
  assert.equal(kuyruk.isDisaAktar({ ...temel, ID: "7", DURUM: "BEKLIYOR" }).id, 7);
  assert.match(sirada.mesaj, /3 etiket DEPO-PC bilgisayarına gönderildi/);
  const basildi = kuyruk.isDisaAktar({ ...temel, DURUM: "BASILDI", YAZICI: "ZY910" });
  assert.equal(basildi.basildi, true);
  assert.equal(basildi.sirada, false);
  assert.match(basildi.mesaj, /basıldı \(ZY910\)/);
  const hata = kuyruk.isDisaAktar({ ...temel, TUR: "DENEME", DURUM: "HATA", SONHATA: "Yazıcı bulunamadı" });
  assert.equal(hata.hata, true);
  assert.match(hata.mesaj, /^Deneme etiketi DEPO-PC bilgisayarında basılamadı: Yazıcı bulunamadı/);
  assert.equal(kuyruk.isDisaAktar(null), null);
});

test("cihaz listesi yalnız pozitif tam sayıları kabul eder", () => {
  assert.deepEqual(kuyruk.idListesi("3, 5,x,-1,0,12"), [3, 5, 12]);
  assert.deepEqual(kuyruk.idListesi(null), []);
});

test("yayımlanan düzen logonun bitmap'ini taşımaz", () => {
  const ayar = etiket.ayarNormalize({
    logo: { resim: "data:image/png;base64,iVBORw0KGgo=", bitmap: { genislik: 8, yukseklik: 1, veri: "/w==" }, xMm: 2, yMm: 2, genislikMm: 10, yukseklikMm: 5 },
  });
  const yayin = JSON.parse(kuyruk.yayinAyari(ayar));
  assert.equal(yayin.logo.bitmap, null);
  assert.equal(yayin.logo.resim, "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(yayin.hedefMakine, undefined);
});

test("etiket bilgisayarı çevrim içi eşiği kalp atışı aralığından geniştir", () => {
  assert.ok(kuyruk.CEVRIMICI_SN * 1000 >= kuyruk.KALP_ATISI_MS * 3);
});

test("baskı çıktıktan sonra basım kaydı hatası işi hataya düşürmez", async () => {
  const cagrilar = [];
  const db = require("../lib/db");
  const eskiTicket = db.ticket;
  // sonucYaz'ın SQL'ini yakalayan sahte havuz.
  db.ticket = () => ({
    request() {
      const girdiler = {};
      const istek = {
        input(ad, _tip, deger) { girdiler[ad] = deger; return istek; },
        async query(sorgu) { cagrilar.push({ sorgu, girdiler: { ...girdiler } }); return { recordset: [], rowsAffected: [1] }; },
      };
      return istek;
    },
  });
  try {
    const sonuc = await kuyruk.isiBas(
      { ID: 9, TUR: "DENEME", GONDEREN: "Ali", GONDERENMAKINE: "KASA" },
      etiket.ayarNormalize({ yazici: "ZY910" }),
      {
        bastir: async (modeller) => { assert.equal(modeller[0].servisNo, "UZAK DENEME"); return { yazici: "ZY910" }; },
        basimKaydet: async () => { throw new Error("kayıt yazılamadı"); },
      },
    );
    assert.equal(sonuc, true);
    const yazilan = cagrilar.find((c) => c.sorgu.includes("UPDATE dbo.ETIKETISLERI"));
    assert.equal(yazilan.girdiler.durum, "BASILDI");
    assert.equal(yazilan.girdiler.yazici, "ZY910");

    cagrilar.length = 0;
    const basarisiz = await kuyruk.isiBas(
      { ID: 10, TUR: "DENEME", GONDEREN: "Ali" },
      etiket.ayarNormalize({}),
      { bastir: async () => { throw new Error("Yazici bulunamadi"); } },
    );
    assert.equal(basarisiz, false);
    assert.equal(cagrilar[0].girdiler.durum, "HATA");
    assert.equal(cagrilar[0].girdiler.hata, "Yazici bulunamadi");
  } finally {
    db.ticket = eskiTicket;
  }
});

test("kuyruk kendi bilgisayarına gelen işi kilitleyerek alır, takılanı kendiliğinden tekrar basmaz", () => {
  const kaynak = fs.readFileSync(path.join(__dirname, "../lib/etiketKuyrugu.js"), "utf8");
  const al = kaynak.slice(kaynak.indexOf("async function siradakiIs"), kaynak.indexOf("async function sonucYaz"));
  assert.match(al, /UPDLOCK, READPAST, ROWLOCK/);
  assert.match(al, /HEDEFMAKINE = @makine AND DURUM = 'BEKLIYOR'/);
  const temizle = kaynak.slice(kaynak.indexOf("async function temizle"), kaynak.indexOf("let sonBildirilen"));
  // BASILIYOR kalan iş BEKLIYOR'a döndürülmez: etiket çıkmış olabilir.
  assert.ok(!/DURUM = 'BEKLIYOR'[^;]*WHERE[^;]*DURUM = 'BASILIYOR'/.test(temizle));
  assert.match(temizle, /SET DURUM = 'HATA'[\s\S]*DURUM = 'BASILIYOR'/);
});
