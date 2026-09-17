const test = require("node:test");
const assert = require("node:assert/strict");
const etiket = require("../lib/etiket");

const ZPL = { dil: "ZPL", genislikMm: 100, yukseklikMm: 50, dpi: 203 };
const TSPL = { dil: "TSPL", genislikMm: 100, yukseklikMm: 50, dpi: 203 };

test("eksik ayar alanı varsayılana düşer, sıfıra değil", () => {
  // Number("") === 0 tuzağı: boş gelen genişlik etiketi en küçük ölçüye
  // indirirse baskı bozulur, kullanıcı sebebini göremez.
  const ayar = etiket.ayarNormalize({ dil: "ZPL" });
  assert.equal(ayar.genislikMm, etiket.VARSAYILAN.genislikMm);
  assert.equal(ayar.yukseklikMm, etiket.VARSAYILAN.yukseklikMm);
  assert.equal(ayar.koyuluk, etiket.VARSAYILAN.koyuluk);
  assert.equal(ayar.adet, 1);
});

test("ayar sınırları kırpılır ve Türkçe ondalık kabul edilir", () => {
  assert.equal(etiket.ayarNormalize({ genislikMm: 999 }).genislikMm, 200);
  assert.equal(etiket.ayarNormalize({ genislikMm: 1 }).genislikMm, 20);
  assert.equal(etiket.ayarNormalize({ genislikMm: "57,5" }).genislikMm, 57.5);
  assert.equal(etiket.ayarNormalize({ dpi: 150 }).dpi, 203);
  assert.equal(etiket.ayarNormalize({ dpi: "300" }).dpi, 300);
  assert.equal(etiket.ayarNormalize({ dil: "tspl" }).dil, "TSPL");
  assert.equal(etiket.ayarNormalize({ dil: "saçma" }).dil, "ZPL");
});

test("ZPL etiket ölçüsü mm'den nokta sayısına çevrilir", () => {
  const { metin } = etiket.uret(etiket.ORNEK_ETIKET, ZPL);
  assert.ok(metin.startsWith("^XA"));
  assert.ok(metin.trimEnd().endsWith("^XZ"));
  assert.ok(metin.includes("^CI13"));          // Türkçe kod sayfası
  assert.ok(metin.includes("^LL400"));         // 50 mm × 203 dpi
  assert.ok(/\^PW79\d/.test(metin));           // 100 mm × 203 dpi
});

test("TSPL çıktısı ölçü, kod sayfası ve baskı komutunu içerir", () => {
  const { metin } = etiket.uret(etiket.ORNEK_ETIKET, TSPL);
  assert.ok(metin.includes("SIZE 100 mm,50 mm"));
  assert.ok(metin.includes("CODEPAGE 857"));
  assert.ok(metin.includes("CLS"));
  assert.ok(metin.includes("PRINT 1,1"));
});

test("üstte cari, ayıraçtan sonra cihaz ve arıza gelir", () => {
  for (const ayar of [ZPL, TSPL]) {
    const { metin } = etiket.uret(etiket.ORNEK_ETIKET, ayar);
    const ayirac = ayar.dil === "ZPL" ? metin.indexOf("^GB") : metin.indexOf("BAR ");
    assert.ok(ayirac > 0, `${ayar.dil}: ayıraç çizgisi yok`);
    assert.ok(metin.indexOf("ÖRNEK BİLİŞİM") < ayirac, `${ayar.dil}: müşteri ayıracın altında`);
    assert.ok(metin.indexOf("0532 123 45 67") < ayirac, `${ayar.dil}: telefon ayıracın altında`);
    assert.ok(metin.indexOf("LaserJet") > ayirac, `${ayar.dil}: cihaz ayıracın üstünde`);
    assert.ok(metin.indexOf("ARIZA:") > ayirac, `${ayar.dil}: arıza ayıracın üstünde`);
  }
});

test("kalın satırlar bir nokta kaydırılıp iki kez basılır", () => {
  // Gömülü/ölçeklenebilir termal fontlarda kalınlık yok; çift baskı karşılığı.
  const zpl = etiket.uret(etiket.ORNEK_ETIKET, ZPL).metin;
  const servisSatirlari = zpl.split("\n").filter((s) => s.includes("SRV-00001"));
  assert.equal(servisSatirlari.length, 2);
  assert.ok(servisSatirlari[0].startsWith("^FO20,"));
  assert.ok(servisSatirlari[1].startsWith("^FO21,"));

  // Telefon kalın değil — tek baskı.
  assert.equal(zpl.split("\n").filter((s) => s.includes("0532 123 45 67")).length, 1);
});

test("uzun arıza metni kelime sınırından sarılır", () => {
  const uzun = "Cihaz açılmıyor, güç kaynağı ses çıkarıyor ve fan dönmüyor, anakart kontrol edilmeli";
  const { metin } = etiket.uret({ ...etiket.ORNEK_ETIKET, ariza: uzun }, ZPL);
  const arizaSatirlari = metin.split("\n").filter((s) => /\^FD(ARIZA:|[a-zçğıöşü])/.test(s) && s.includes("^A0N,29"));
  assert.ok(metin.includes("ARIZA: Cihaz açılmıyor"));
  // Kelime ortasından kesilmemeli.
  assert.ok(!/\^FD[^^]*[a-zçğıöşü]-\^FS/.test(metin));
  assert.ok(arizaSatirlari.length >= 2);
});

test("sardır tek uzun kelimede sonsuz döngüye girmez", () => {
  const parcalar = etiket.sardir("A".repeat(200), 10, 3);
  assert.equal(parcalar.length, 3);
  assert.ok(parcalar.every((p) => p.length <= 10));
});

test("boş alanlar etikette satır açmaz", () => {
  const { metin } = etiket.uret({ servisNo: "SRV-000042", musteri: "Ali Veli" }, ZPL);
  assert.ok(metin.includes("SRV-000042"));
  assert.ok(metin.includes("Ali Veli"));
  assert.ok(metin.includes("Cihaz belirtilmedi"));
  assert.ok(!metin.includes("S/N:"));
  assert.ok(!metin.includes("ARIZA:"));
  assert.ok(!metin.includes("Kabul:"));
});

test("Türkçe karakterler CP857 baytlarına kodlanır", () => {
  const beklenen = { "Ç": 0x80, "ç": 0x87, "ı": 0x8d, "İ": 0x98, "Ö": 0x99, "Ü": 0x9a, "Ş": 0x9e, "ş": 0x9f, "Ğ": 0xa6, "ğ": 0xa7, "ö": 0x94, "ü": 0x81 };
  for (const [harf, bayt] of Object.entries(beklenen)) {
    assert.equal(etiket.cp857(harf)[0], bayt, `${harf} yanlış kodlandı`);
  }
  // Tablo dışı karakter tek bayt "?" olur, çok baytlı UTF-8 sızmaz.
  assert.equal(etiket.cp857("漢").toString("latin1"), "?");
});

test("ASCII'ye indirgeme Türkçe harfleri karşılığına çevirir", () => {
  assert.equal(etiket.asciiyeIndir("Şişli Ğüç İzmir"), "Sisli Guc Izmir");
  const { veri } = etiket.uret({ servisNo: "SRV-1", musteri: "Şişli" }, { ...ZPL, asciiyeIndir: true });
  assert.ok(veri.toString("ascii").includes("Sisli"));
});

test("ZPL komut önekleri müşteri adından temizlenir", () => {
  // Cari adında ^ veya ~ geçerse etiket komutu bozulur ya da baskı hiç çıkmaz.
  const { metin } = etiket.uret({ servisNo: "SRV-1", musteri: "AC^ME~FS Ltd" }, ZPL);
  const govde = metin.split("\n").filter((s) => s.includes("ME"));
  assert.ok(govde.length > 0);
  for (const satir of govde) {
    assert.equal(satir.split("^FD")[1].split("^FS")[0].includes("^"), false);
    assert.equal(satir.includes("~"), false);
  }
});

test("TSPL dize ayıracı cihaz bilgisinden temizlenir", () => {
  const { metin } = etiket.uret({ servisNo: "SRV-1", marka: 'AC"ME\\X' }, TSPL);
  const satir = metin.split("\r\n").find((s) => s.includes("ME"));
  // TEXT x,y,"font",0,sx,sy,"metin" → tam 4 tırnak. Fazlası metnin dize
  // ayıracını kırdığı, yani komutun bozulduğu anlamına gelir.
  assert.equal((satir.match(/"/g) || []).length, 4);
  assert.equal(satir.includes("\\"), false);
  assert.equal(satir.match(/"([^"]*)"$/)[1], "AC ME X");
});

test("etiket yükseklikten taşan satırı basmaz", () => {
  const kisa = etiket.uret(etiket.ORNEK_ETIKET, { ...ZPL, yukseklikMm: 20 }).metin;
  const tam = etiket.uret(etiket.ORNEK_ETIKET, ZPL).metin;
  assert.ok(kisa.includes("SRV-00001"));
  assert.ok(!kisa.includes("ARIZA:"), "20 mm etikete arıza satırı sığmamalı");
  assert.ok(tam.includes("ARIZA:"));
});

test("çoklu etiket tek işte birleştirilir", () => {
  const { veri, metin, adet } = etiket.coklUret(
    [etiket.ORNEK_ETIKET, { ...etiket.ORNEK_ETIKET, servisNo: "SRV-00002" }],
    ZPL
  );
  assert.equal(adet, 2);
  assert.equal(metin.match(/\^XA/g).length, 2);
  assert.ok(metin.includes("SRV-00001") && metin.includes("SRV-00002"));
  assert.ok(Buffer.isBuffer(veri) && veri.length > 0);
});

test("adet ayarı yazıcı kopya komutuna yansır", () => {
  assert.ok(etiket.uret(etiket.ORNEK_ETIKET, { ...ZPL, adet: 3 }).metin.includes("^PQ3"));
  assert.ok(etiket.uret(etiket.ORNEK_ETIKET, { ...TSPL, adet: 3 }).metin.includes("PRINT 1,3"));
});

test("varsayılan ayar ZY910 için TSPL 80×40 @203 dpi", () => {
  // ZY910 (ZYWELL) etiket modunda TSPL/CPCL konuşur; ESC/POS yalnız fiş modunda.
  assert.equal(etiket.VARSAYILAN.dil, "TSPL");
  assert.equal(etiket.VARSAYILAN.genislikMm, 80);
  assert.equal(etiket.VARSAYILAN.yukseklikMm, 40);
  assert.equal(etiket.VARSAYILAN.dpi, 203);
});

test("80×40 yapışkan etikete arıza dahil bütün alanlar sığar", () => {
  // Etiketin asıl işi arızayı taşımak; küçük etikette ilk düşen satır o olurdu.
  const uzunAriza = "Kağıt sıkışıyor, çıktıda dikey siyah çizgi var";
  for (const dil of ["TSPL", "ZPL"]) {
    const { metin } = etiket.uret(
      { ...etiket.ORNEK_ETIKET, ariza: uzunAriza },
      { dil, genislikMm: 80, yukseklikMm: 40, dpi: 203 }
    );
    for (const beklenen of ["SRV-00001", "ÖRNEK BİLİŞİM", "0532 123 45 67", "LaserJet", "S/N:", "ARIZA:"]) {
      assert.ok(metin.includes(beklenen), `${dil} 80×40: "${beklenen}" etikete girmedi`);
    }
    // Ayıraç hâlâ cari ile cihaz bloğunu ayırıyor.
    assert.ok(metin.includes(dil === "ZPL" ? "^GB" : "BAR "));
  }
});

test("yerleşim etiket boyuna göre ölçeklenir", () => {
  assert.equal(etiket.olcekBul(50), 1);
  assert.equal(etiket.olcekBul(40), 0.9);
  assert.equal(etiket.olcekBul(15), 0.68);   // alt sınır: okunabilirlik
  assert.equal(etiket.olcekBul(200), 1.15);  // üst sınır: font şişmesin
});

test("TSPL küçük fontu katlamak yerine sığan en büyük tabanı seçer", () => {
  // "1"×3 ile "4"×1 aynı yüksekliğe yakın çıkar ama katlanmış nokta fontu
  // kaba basar; gerçek büyük font okunaklıdır.
  const buyuk = etiket.tsplFontSec(36);
  assert.equal(buyuk.ad, "4");
  assert.equal(buyuk.kat, 1);

  assert.equal(etiket.tsplFontSec(24).ad, "3");
  assert.equal(etiket.tsplFontSec(20).ad, "2");
  assert.equal(etiket.tsplFontSec(12).ad, "1");
  // Hedefin altına düşse de asla üstüne çıkmaz.
  for (const hedef of [10, 15, 23, 31, 47, 100]) {
    assert.ok(etiket.tsplFontSec(hedef).yukseklik <= Math.max(hedef, 12));
  }
});

test("TSPL satırları seçilen fontla aynı katı kullanır", () => {
  const { metin } = etiket.uret(etiket.ORNEK_ETIKET, { dil: "TSPL", genislikMm: 80, yukseklikMm: 40 });
  for (const satir of metin.split("\r\n").filter((s) => s.startsWith("TEXT "))) {
    // TEXT x,y,"font",dönüş,xKat,yKat,"metin" — x ve y katı eşit olmalı,
    // aksi halde yazı yatay veya dikey eziliyor.
    const [, xKat, yKat] = satir.match(/,0,(\d+),(\d+),"/);
    assert.equal(xKat, yKat, satir);
  }
});

// 16×2 noktalık logo: ilk satır tamamen siyah, ikinci satır yalnız ilk nokta.
const LOGO = {
  resim: "data:image/png;base64,iVBORw0KGgo=",
  bitmap: { genislik: 16, yukseklik: 2, veri: Buffer.from([0xff, 0xff, 0x80, 0x00]).toString("base64") },
  xMm: 2, yMm: 3, genislikMm: 2, yukseklikMm: 0.25,
};

test("özel ayar yoksa yazı yerleşimi değişmez", () => {
  const eski = etiket.uret(etiket.ORNEK_ETIKET, ZPL).metin;
  const bos = etiket.uret(etiket.ORNEK_ETIKET, { ...ZPL, metinXMm: "", metinYMm: "", metinGenislikMm: "", yaziOlcek: "" }).metin;
  assert.equal(bos, eski);
  assert.equal(etiket.ayarNormalize({}).logo, null);
});

test("yazı bloğu verilen konuma taşınır ve genişliğe göre sarılır", () => {
  // 30 mm @203 dpi = 240 nokta, 10 mm = 80 nokta.
  const { metin } = etiket.uret(etiket.ORNEK_ETIKET, { ...ZPL, metinXMm: 30, metinYMm: 10, metinGenislikMm: 60 });
  const satirlar = metin.split("\n").filter((s) => s.startsWith("^FO") && s.includes("^FD"));
  assert.ok(satirlar[0].startsWith("^FO240,80^"), satirlar[0]);
  assert.ok(satirlar.every((s) => /^\^FO24[01],/.test(s)), "tüm satırlar aynı soldan başlamalı");
  const ayirac = metin.split("\n").find((s) => s.includes("^GB"));
  assert.match(ayirac, /^\^FO240,\d+\^GB(\d+),/);
  assert.equal(Number(ayirac.match(/\^GB(\d+),/)[1]), 480);  // 60 mm
});

test("yazı boyutu ölçeği satır yüksekliğine yansır", () => {
  const boy = (olcek) =>
    Number(etiket.uret(etiket.ORNEK_ETIKET, { ...ZPL, yaziOlcek: olcek }).metin.match(/\^A0N,(\d+),\d+\^FDSRV-00001/)[1]);
  assert.ok(boy(1.5) > boy(1));
  assert.ok(boy(0.7) < boy(1));
  assert.equal(etiket.ayarNormalize({ yaziOlcek: 9 }).yaziOlcek, 2);
});

test("ZPL logosu ^GFA ile verilen konuma basılır, 1 = siyah", () => {
  const { metin } = etiket.uret(etiket.ORNEK_ETIKET, { ...ZPL, logo: LOGO });
  // 2 mm = 16 nokta, 3 mm = 24 nokta; 4 bayt, satır başına 2 bayt.
  assert.ok(metin.includes("^FO16,24^GFA,4,4,2,FFFF8000^FS"), metin);
  assert.ok(metin.indexOf("^GFA") < metin.indexOf("SRV-00001"), "logo yazının altında kalmalı");
});

test("TSPL logosu BITMAP ikili verisiyle, bitleri ters çevrilerek gönderilir", () => {
  const { veri, metin } = etiket.uret(etiket.ORNEK_ETIKET, { ...TSPL, logo: LOGO });
  assert.ok(metin.includes("BITMAP 16,24,2,2,0,<4 bayt logo>"), metin);
  const onEk = Buffer.from("BITMAP 16,24,2,2,0,", "ascii");
  const bas = veri.indexOf(onEk) + onEk.length;
  assert.ok(bas > onEk.length);
  // TSPL'de 0 = siyah nokta.
  assert.deepEqual([...veri.subarray(bas, bas + 4)], [0x00, 0x00, 0x7f, 0xff]);
  assert.equal(veri.subarray(bas + 4, bas + 6).toString("ascii"), "\r\n");
  assert.ok(!veri.includes(Buffer.from("\u0000BITMAP")), "yer tutucu veride kalmamalı");
});

test("bozuk logo bitmap'i yok sayılır, PNG dışı resim logoyu kapatır", () => {
  const eksik = etiket.logoNormalize({ ...LOGO, bitmap: { ...LOGO.bitmap, yukseklik: 3 } });
  assert.equal(eksik.bitmap, null);
  assert.ok(!etiket.uret(etiket.ORNEK_ETIKET, { ...ZPL, logo: eksik }).metin.includes("^GFA"));
  assert.equal(etiket.logoNormalize({ ...LOGO, resim: "data:image/svg+xml;base64,PHN2Zz4=" }), null);
  assert.equal(etiket.logoNormalize({ ...LOGO, resim: "javascript:alert(1)" }), null);
});

test("sürücü belgesi logoyu mm konumu ve saf base64 PNG ile taşır", () => {
  const { belge } = etiket.belgeUret(etiket.ORNEK_ETIKET, { ...ZPL, logo: LOGO });
  // Çok küçük ölçü en az 3×1 mm'ye büyütülür.
  assert.deepEqual(belge.logo, { veri: "iVBORw0KGgo=", xMm: 2, yMm: 3, genislikMm: 3, yukseklikMm: 1 });
  assert.equal(etiket.belgeUret(etiket.ORNEK_ETIKET, ZPL).belge.logo, null);
});

test("örnek etikette gerçek müşteri adı geçmez", () => {
  assert.ok(!/ÖZDEMİRKAYA|ozdemirkaya/i.test(JSON.stringify(etiket.ORNEK_ETIKET)));
});
