/**
 * Termal etiket üretimi — ZPL (Zebra) ve TSPL (TSC / Argox / Godex).
 *
 * Saf modül: dosya, yazıcı, veritabanı yok. Girdi bir etiket modeli, çıktı
 * yazıcıya ham gönderilecek Buffer. Böylece komut üretimi testlerle sabitlenir
 * ve yazıcı olmadan da doğrulanabilir.
 *
 * Düzen: üstte cari bilgisi, ayıraç çizgi, altta cihaz ve arıza. Vurgulanacak
 * satırlar kalın basılır.
 *
 * Türkçe karakterler CP857 (DOS Türkçe) ile kodlanır; ZPL ^CI13 ve TSPL
 * CODEPAGE 857 aynı tabloyu kullanır. Yazıcı 857 desteklemiyorsa ayarlardan
 * ASCII'ye indirgeme açılır.
 */

// CP857'de ASCII üstü, Türkçe metinde geçebilecek karakterler.
const CP857 = {
  "Ç": 0x80, "ü": 0x81, "é": 0x82, "â": 0x83, "ä": 0x84, "à": 0x85, "å": 0x86, "ç": 0x87,
  "ê": 0x88, "ë": 0x89, "è": 0x8a, "ï": 0x8b, "î": 0x8c, "ı": 0x8d, "Ä": 0x8e, "Å": 0x8f,
  "É": 0x90, "æ": 0x91, "Æ": 0x92, "ô": 0x93, "ö": 0x94, "ò": 0x95, "û": 0x96, "ù": 0x97,
  "İ": 0x98, "Ö": 0x99, "Ü": 0x9a, "ø": 0x9b, "£": 0x9c, "Ø": 0x9d, "Ş": 0x9e, "ş": 0x9f,
  "á": 0xa0, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ñ": 0xa4, "Ñ": 0xa5, "Ğ": 0xa6, "ğ": 0xa7,
  "«": 0xae, "»": 0xaf, "Á": 0xb5, "Â": 0xb6, "À": 0xb7, "©": 0xb8,
  "ã": 0xc6, "Ã": 0xc7, "Ê": 0xd2, "È": 0xd4, "Í": 0xd6, "Î": 0xd7, "Ï": 0xd8,
  "Ó": 0xe0, "ß": 0xe1, "Ô": 0xe2, "Ò": 0xe3, "õ": 0xe4, "Õ": 0xe5, "µ": 0xe6,
  "Ú": 0xe9, "Û": 0xea, "Ù": 0xeb, "ì": 0xec, "ÿ": 0xed, "´": 0xef, "°": 0xf8, "·": 0xfa,
};

// 857 desteklemeyen ucuz yazıcılar için son çare.
const ASCII_KARSILIK = {
  "ç": "c", "Ç": "C", "ğ": "g", "Ğ": "G", "ı": "i", "İ": "I",
  "ö": "o", "Ö": "O", "ş": "s", "Ş": "S", "ü": "u", "Ü": "U",
  "â": "a", "Â": "A", "î": "i", "Î": "I", "û": "u", "Û": "U",
};

const asciiyeIndir = (metin) =>
  String(metin ?? "").replace(/[^\x20-\x7e]/g, (ch) => ASCII_KARSILIK[ch] ?? "?");

/** Kontrol karakterlerini ve komut ayıracı olabilecek işaretleri atar. */
function temizle(metin, { zpl = false, tspl = false } = {}) {
  let out = String(metin ?? "").replace(/[\x00-\x1f\x7f]/g, " ");
  if (zpl) out = out.replace(/[\^~]/g, " ");       // ZPL komut önekleri
  if (tspl) out = out.replace(/["\\]/g, " ");      // TSPL dize ayıracı
  return out.replace(/\s+/g, " ").trim();
}

/** Metni CP857 baytlarına çevirir; tablo dışı karakter ASCII karşılığına düşer. */
function cp857(metin) {
  const bayt = [];
  for (const ch of String(metin ?? "")) {
    const kod = ch.codePointAt(0);
    if (kod < 0x80) { bayt.push(kod); continue; }
    if (CP857[ch] !== undefined) { bayt.push(CP857[ch]); continue; }
    for (const c of ASCII_KARSILIK[ch] ?? "?") bayt.push(c.charCodeAt(0));
  }
  return Buffer.from(bayt);
}

const MM_BASINA_INC = 25.4;
const nokta = (mm, dpi) => Math.round((Number(mm) * Number(dpi)) / MM_BASINA_INC);

/**
 * Satır boyutları, 50 mm boyundaki referans etikete göre mm cinsinden.
 * Daha kısa etikette hepsi `olcekBul` ile orantılı küçülür.
 */
const BOYUTLAR = {
  buyuk: { mm: 5.6 },
  orta: { mm: 3.6 },
  kucuk: { mm: 2.8 },
};

const REFERANS_YUKSEKLIK_MM = 50;

/**
 * Yerleşim ölçeği. 80×40 gibi küçük etikette satırlar sığmazsa arıza notu
 * düşer — oysa etiketin asıl işi o. Alt sınır okunabilirlik için, üst sınır
 * büyük etikette fontun gereksiz şişmemesi için.
 */
// Doğrudan oran (40/50 = 0.80) küçük etikette gereğinden çok küçültüyor ve
// altta boşluk bırakıyordu. Yarı sabit + yarı orantılı eğri 40 mm'de 0.90
// veriyor; iki satırlık arıza notu hâlâ sığıyor, alan da boşa gitmiyor.
const olcekBul = (yukseklikMm) =>
  Math.min(Math.max(0.5 + (0.5 * Number(yukseklikMm)) / REFERANS_YUKSEKLIK_MM, 0.68), 1.15);

/**
 * TSPL gömülü fontları nokta cinsinden sabit ölçüdedir ve yalnız tam sayı
 * katlarıyla büyür. Hedef yüksekliğe sığan en büyük font+kat çifti seçilir;
 * ZPL'in sürekli ölçeklenen ^A0 fontuyla görsel olarak eşleşsin diye.
 */
const TSPL_FONTLARI = [
  { ad: "1", genislik: 8, yukseklik: 12 },
  { ad: "2", genislik: 12, yukseklik: 20 },
  { ad: "3", genislik: 16, yukseklik: 24 },
  { ad: "4", genislik: 24, yukseklik: 32 },
  { ad: "5", genislik: 32, yukseklik: 48 },
];

function tsplFontSec(hedefNokta) {
  // Önce sığan en büyük TABAN font. Küçük nokta fontunu katlamak aynı yüksekliği
  // verir ama kaba çıkar; gerçek büyük font daha okunaklı basar.
  let secilen = TSPL_FONTLARI[0];
  for (const font of TSPL_FONTLARI) {
    if (font.yukseklik <= hedefNokta) secilen = font;
  }
  // Taban font hedefin altındaysa ve katı da sığıyorsa büyüt.
  let kat = 1;
  while (secilen.yukseklik * (kat + 1) <= hedefNokta) kat++;
  return {
    ad: secilen.ad,
    kat,
    genislik: secilen.genislik * kat,
    yukseklik: secilen.yukseklik * kat,
  };
}

const VARSAYILAN = {
  // "surucu": Windows yazdırma sürücüsünden basar. Her yazıcıda çalışır,
  // gerçek TrueType font ve gerçek kalınlık verir, Türkçe için kod sayfası
  // çevirisi gerekmez. Varsayılan yol bu.
  // "ham": ZPL/TSPL komutlarını doğrudan gönderir. Sürücü etiketi yanlış
  // ölçekliyor veya kuyruğa takılıyorsa bu yola geçilir.
  yontem: "surucu",    // surucu | ham
  // ZY910 (ZYWELL) etiket modunda TSPL/CPCL konuşur, 203 dpi. Piyasadaki
  // ucuz termal etiket yazıcılarının çoğu da TSPL uyumlu — makul varsayılan.
  dil: "TSPL",         // ZPL | TSPL — yalnız "ham" yolunda kullanılır
  genislikMm: 80,
  yukseklikMm: 40,
  dpi: 203,
  bosluk: 2,           // TSPL GAP (mm) — yapışkan etiket arası boşluk
  yon: 1,              // TSPL DIRECTION
  koyuluk: 8,          // ZPL ^MD / TSPL DENSITY
  hiz: 4,              // TSPL SPEED (ips)
  asciiyeIndir: false,
  yazici: "",
  adet: 1,
  // Yazı bloğunun yeri; boşsa kenar boşluğundan başlar ve etiketi doldurur.
  metinXMm: null,
  metinYMm: null,
  metinGenislikMm: null,
  yaziOlcek: 1,
  // { resim: PNG data URL, bitmap: { genislik, yukseklik, veri }, xMm, yMm, genislikMm, yukseklikMm }
  logo: null,
  // Bu bilgisayarın yazıcısı başka bilgisayarlardan gelen etiketleri de basar.
  paylas: false,
  // Boş değilse etiketler bu adlı bilgisayarın yazıcısına gönderilir.
  hedefMakine: "",
};

/** Boş alan varsayılana düşer — Number("") === 0 tuzağı. */
function sayi(deger, varsayilan, alt, ust) {
  const ham = String(deger ?? "").trim().replace(",", ".");
  if (!ham) return varsayilan;
  const n = Number(ham);
  if (!Number.isFinite(n)) return varsayilan;
  return Math.min(Math.max(n, alt), ust);
}

const LOGO_RESMI = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const LOGO_EN_FAZLA_KARAKTER = 700000;
const BITMAP_EN_FAZLA_NOKTA = 2400;

/**
 * Logo iki biçimde gelir: Windows sürücüsü yolu için PNG, ham komut yolu için
 * arayüzün etiket çözünürlüğünde ürettiği 1 bit/nokta bitmap (satır başına
 * ceil(genişlik/8) bayt, en soldaki bit 1 = siyah). Bozuk bitmap yok sayılır.
 */
function logoNormalize(ham) {
  if (!ham || typeof ham !== "object") return null;
  const resim = String(ham.resim || "");
  if (resim.length > LOGO_EN_FAZLA_KARAKTER || !LOGO_RESMI.test(resim)) return null;
  let bitmap = null;
  const b = ham.bitmap || {};
  const genislik = Number(b.genislik);
  const yukseklik = Number(b.yukseklik);
  const veri = String(b.veri || "");
  if (Number.isInteger(genislik) && Number.isInteger(yukseklik) && genislik > 0 && yukseklik > 0
    && genislik <= BITMAP_EN_FAZLA_NOKTA && yukseklik <= BITMAP_EN_FAZLA_NOKTA && /^[A-Za-z0-9+/=]+$/.test(veri)
    && Buffer.from(veri, "base64").length === Math.ceil(genislik / 8) * yukseklik) {
    bitmap = { genislik, yukseklik, veri };
  }
  return {
    resim,
    bitmap,
    xMm: sayi(ham.xMm, 2, 0, 200),
    yMm: sayi(ham.yMm, 2, 0, 200),
    genislikMm: sayi(ham.genislikMm, 20, 3, 200),
    yukseklikMm: sayi(ham.yukseklikMm, 10, 1, 200),
  };
}

/** İsteğe bağlı mm değeri: boşsa null (otomatik). */
function secimliMm(deger, alt, ust) {
  return String(deger ?? "").trim() === "" ? null : sayi(deger, null, alt, ust);
}

/** Ayarı normalize eder; arayüzden gelen serbest metni sayıya sabitler. */
function ayarNormalize(ham = {}) {
  return {
    yontem: String(ham.yontem || VARSAYILAN.yontem).toLowerCase() === "ham" ? "ham" : "surucu",
    dil: String(ham.dil || VARSAYILAN.dil).toUpperCase() === "TSPL" ? "TSPL" : "ZPL",
    genislikMm: sayi(ham.genislikMm, VARSAYILAN.genislikMm, 20, 200),
    yukseklikMm: sayi(ham.yukseklikMm, VARSAYILAN.yukseklikMm, 15, 200),
    dpi: [203, 300, 600].includes(Number(ham.dpi)) ? Number(ham.dpi) : VARSAYILAN.dpi,
    bosluk: sayi(ham.bosluk, VARSAYILAN.bosluk, 0, 20),
    yon: Number(ham.yon) === 0 ? 0 : 1,
    koyuluk: Math.round(sayi(ham.koyuluk, VARSAYILAN.koyuluk, 0, 15)),
    hiz: Math.round(sayi(ham.hiz, VARSAYILAN.hiz, 1, 12)),
    asciiyeIndir: Boolean(ham.asciiyeIndir),
    yazici: String(ham.yazici || "").trim().slice(0, 200),
    adet: Math.round(sayi(ham.adet, VARSAYILAN.adet, 1, 10)),
    metinXMm: secimliMm(ham.metinXMm, 0, 200),
    metinYMm: secimliMm(ham.metinYMm, 0, 200),
    metinGenislikMm: secimliMm(ham.metinGenislikMm, 5, 200),
    yaziOlcek: sayi(ham.yaziOlcek, VARSAYILAN.yaziOlcek, 0.5, 2),
    logo: logoNormalize(ham.logo),
    paylas: Boolean(ham.paylas),
    hedefMakine: String(ham.hedefMakine || "").trim().slice(0, 128),
  };
}

/**
 * Uzun metni kelime sınırından en çok `enFazlaSatir` parçaya böler.
 * Satıra sığmayan tek kelime (uzun seri no, model kodu) sessizce kaybolmasın
 * diye zorla kesilip sonraki satırlardan devam eder.
 */
function sardir(metin, enFazlaKarakter, enFazlaSatir) {
  const genislik = Math.max(1, Math.floor(enFazlaKarakter));
  const kelimeler = String(metin ?? "").split(" ").filter(Boolean);
  const satirlar = [];
  let aktif = "";

  const bitir = () => {
    if (aktif) satirlar.push(aktif);
    aktif = "";
    return satirlar.length >= enFazlaSatir;
  };

  for (const kelime of kelimeler) {
    if (aktif && `${aktif} ${kelime}`.length <= genislik) {
      aktif = `${aktif} ${kelime}`;
      continue;
    }
    if (bitir()) break;
    let kalan = kelime;
    while (kalan.length > genislik) {
      satirlar.push(kalan.slice(0, genislik));
      kalan = kalan.slice(genislik);
      if (satirlar.length >= enFazlaSatir) return satirlar.slice(0, enFazlaSatir);
    }
    aktif = kalan;
  }
  bitir();
  return satirlar.slice(0, enFazlaSatir);
}

/**
 * Etiket modelini bloklara çevirir.
 *   üst  → cari bilgisi (kime ait)
 *   ayıraç
 *   alt  → cihaz ve arıza (raftaki cihaz için ne yapılacak)
 * Boş alan satır açmaz.
 */
function satirlar(etiket = {}) {
  const al = (x) => String(x ?? "").trim();
  const cihaz = [al(etiket.marka), al(etiket.model)].filter(Boolean).join(" ");
  const cihazSatiri = [al(etiket.cins), cihaz].filter(Boolean).join(": ") || "Cihaz belirtilmedi";
  const kunye = [
    al(etiket.seriNo) ? `S/N: ${al(etiket.seriNo)}` : "",
    al(etiket.kabulTarihi) ? `Kabul: ${al(etiket.kabulTarihi)}` : "",
    al(etiket.sira),
  ].filter(Boolean).join("   ");

  const ust = [
    { metin: al(etiket.servisNo), boyut: "buyuk", kalin: true },
    { metin: al(etiket.musteri), boyut: "orta", kalin: true },
    { metin: al(etiket.telefon), boyut: "orta", kalin: false },
  ].filter((s) => s.metin);

  const alt = [
    { metin: cihazSatiri, boyut: "orta", kalin: true },
    { metin: kunye, boyut: "kucuk", kalin: false },
    { metin: al(etiket.ariza) ? `ARIZA: ${al(etiket.ariza)}` : "", boyut: "orta", kalin: true, sar: 2 },
  ].filter((s) => s.metin);

  return { ust, alt };
}

const KENAR_MM = 2.5;
const SATIR_ARASI_MM = 1.1;
const AYIRAC_BOSLUK_MM = 1.4;

/**
 * Ortak yerleşim: logoyu çizer, sonra her satırı yazı bloğu içinde sırayla
 * konumlandırıp çizim geri çağrısına verir. Yazı bloğunun yeri, genişliği ve
 * yazı boyutu ayardan değiştirilebilir; boş bırakılırsa etiketi kenardan doldurur.
 */
function yerlestir(etiket, ayar, { yaz, ayirac, logo }) {
  const olcek = olcekBul(ayar.yukseklikMm);
  const yazi = olcek * (ayar.yaziOlcek ?? 1);
  const genislik = nokta(ayar.genislikMm, ayar.dpi);
  const yukseklik = nokta(ayar.yukseklikMm, ayar.dpi);
  const kenar = nokta(KENAR_MM * olcek, ayar.dpi);
  const x0 = ayar.metinXMm == null ? kenar : nokta(ayar.metinXMm, ayar.dpi);
  const sag = ayar.metinGenislikMm == null
    ? genislik - kenar
    : Math.min(genislik, x0 + nokta(ayar.metinGenislikMm, ayar.dpi));
  const kullanilir = Math.max(sag - x0, nokta(5, ayar.dpi));
  const aralik = nokta(SATIR_ARASI_MM * yazi, ayar.dpi);
  const { ust, alt } = satirlar(etiket);

  if (ayar.logo && logo) {
    logo({
      x: nokta(ayar.logo.xMm, ayar.dpi),
      y: nokta(ayar.logo.yMm, ayar.dpi),
      genislik: nokta(ayar.logo.genislikMm, ayar.dpi),
      yukseklik: nokta(ayar.logo.yukseklikMm, ayar.dpi),
    });
  }

  let y = ayar.metinYMm == null ? kenar : nokta(ayar.metinYMm, ayar.dpi);
  const blokBas = (bloklar) => {
    for (const satir of bloklar) {
      const h = nokta(BOYUTLAR[satir.boyut].mm * yazi, ayar.dpi);
      const enFazlaKarakter = yaz.karakterSigar(h, kullanilir);
      for (const parca of sardir(satir.metin, enFazlaKarakter, satir.sar || 1)) {
        if (y + h > yukseklik - kenar) return false;   // etikete sığmayan satır basılmaz
        yaz.satir({ metin: parca, x: x0, y, h, kalin: satir.kalin });
        y += h + aralik;
      }
    }
    return true;
  };

  if (blokBas(ust) && alt.length) {
    const bosluk = nokta(AYIRAC_BOSLUK_MM * yazi, ayar.dpi);
    const cizgiY = y + Math.round(bosluk / 2);
    const kalinlik = Math.max(2, nokta(0.3, ayar.dpi));
    if (cizgiY + kalinlik < yukseklik - kenar) {
      ayirac({ x: x0, y: cizgiY, genislik: kullanilir, kalinlik });
      y = cizgiY + kalinlik + bosluk;
    }
    blokBas(alt);
  }
}

// TSPL BITMAP ikili veri ister; komut metni kod sayfasıyla kodlanırken bu
// işaretin yerine bayt olarak konur. Kontrol karakteri içerdiği için metinden
// (temizle() bunları atar) gelemez.
const BITMAP_ISARETI = "\u0000BITMAP\u0000";

function zplUret(etiket, ayar) {
  const genislik = nokta(ayar.genislikMm, ayar.dpi);
  const yukseklik = nokta(ayar.yukseklikMm, ayar.dpi);
  const parcalar = [`^XA`, `^CI13`, `^PW${genislik}`, `^LL${yukseklik}`, `^LH0,0`, `^MD${ayar.koyuluk}`];
  // ^A0 ölçeklenebilir fontta kalınlık yok; metni 1 nokta kaydırıp ikinci kez
  // basmak Zebra'da yaygın "bold" karşılığıdır.
  const kaydirma = Math.max(1, Math.round(ayar.dpi / 203));

  yerlestir(etiket, ayar, {
    yaz: {
      // ^A0 ortalama karakter genişliği ≈ yüksekliğin 0.6'sı.
      karakterSigar: (h, kullanilir) => Math.max(4, Math.floor(kullanilir / (h * 0.6))),
      satir({ metin, x, y, h, kalin }) {
        let temiz = temizle(metin, { zpl: true });
        if (ayar.asciiyeIndir) temiz = asciiyeIndir(temiz);
        parcalar.push(`^FO${x},${y}^A0N,${h},${h}^FD${temiz}^FS`);
        if (kalin) parcalar.push(`^FO${x + kaydirma},${y}^A0N,${h},${h}^FD${temiz}^FS`);
      },
    },
    ayirac: ({ x, y, genislik: g, kalinlik }) => parcalar.push(`^FO${x},${y}^GB${g},${kalinlik},${kalinlik}^FS`),
    logo: ({ x, y }) => {
      const bitmap = ayar.logo?.bitmap;
      if (!bitmap) return;
      // ^GF A (ASCII hex): 1 = siyah nokta.
      const hex = Buffer.from(bitmap.veri, "base64").toString("hex").toUpperCase();
      const bayt = hex.length / 2;
      parcalar.push(`^FO${x},${y}^GFA,${bayt},${bayt},${Math.ceil(bitmap.genislik / 8)},${hex}^FS`);
    },
  });

  parcalar.push(`^PQ${ayar.adet}`, `^XZ`, ``);
  return parcalar.join("\n");
}

function tsplUret(etiket, ayar) {
  const parcalar = [
    `SIZE ${ayar.genislikMm} mm,${ayar.yukseklikMm} mm`,
    `GAP ${ayar.bosluk} mm,0 mm`,
    `DIRECTION ${ayar.yon}`,
    `DENSITY ${ayar.koyuluk}`,
    `SPEED ${ayar.hiz}`,
    `CODEPAGE 857`,
    `CLS`,
  ];
  const kaydirma = Math.max(1, Math.round(ayar.dpi / 203));

  yerlestir(etiket, ayar, {
    yaz: {
      // Gömülü fontlar sabit genişlikte; kaç karakter sığdığı tam hesaplanır.
      karakterSigar: (h, kullanilir) =>
        Math.max(4, Math.floor(kullanilir / tsplFontSec(h).genislik)),
      satir({ metin, x, y, h, kalin }) {
        let temiz = temizle(metin, { tspl: true });
        if (ayar.asciiyeIndir) temiz = asciiyeIndir(temiz);
        const font = tsplFontSec(h);
        const yazdir = (px) =>
          parcalar.push(`TEXT ${px},${y},"${font.ad}",0,${font.kat},${font.kat},"${temiz}"`);
        yazdir(x);
        if (kalin) yazdir(x + kaydirma);
      },
    },
    ayirac: ({ x, y, genislik, kalinlik }) => parcalar.push(`BAR ${x},${y},${genislik},${kalinlik}`),
    logo: ({ x, y }) => {
      const bitmap = ayar.logo?.bitmap;
      if (!bitmap) return;
      parcalar.push(`BITMAP ${x},${y},${Math.ceil(bitmap.genislik / 8)},${bitmap.yukseklik},0,${BITMAP_ISARETI}`);
    },
  });

  parcalar.push(`PRINT 1,${ayar.adet}`, ``);
  return parcalar.join("\r\n");
}

/**
 * Yerleşimi komut dilinden bağımsız, mm cinsinden belge olarak üretir.
 * Windows sürücüsüyle basma yolu bunu kullanır: GDI+ gerçek TrueType font ve
 * gerçek kalın basar, Türkçe için kod sayfası çevirisi gerekmez.
 */
function belgeUret(etiket, hamAyar) {
  const ayar = ayarNormalize(hamAyar);
  const mm = (n) => Math.round((n / ayar.dpi) * MM_BASINA_INC * 1000) / 1000;
  const satirlar = [];
  let ayirac = null;

  yerlestir(etiket, ayar, {
    yaz: {
      // Arial gibi orantılı fontta ortalama karakter genişliği ≈ yüksekliğin
      // 0.5'i; sarma hesabı biraz temkinli tutuldu ki satır taşmasın.
      karakterSigar: (h, kullanilir) => Math.max(4, Math.floor(kullanilir / (h * 0.55))),
      satir({ metin, x, y, h, kalin }) {
        const temiz = ayar.asciiyeIndir ? asciiyeIndir(temizle(metin)) : temizle(metin);
        if (temiz) satirlar.push({ metin: temiz, xMm: mm(x), yMm: mm(y), boyMm: mm(h), kalin: Boolean(kalin) });
      },
    },
    ayirac: ({ x, y, genislik, kalinlik }) => {
      ayirac = { xMm: mm(x), yMm: mm(y), genislikMm: mm(genislik), kalinlikMm: mm(kalinlik) };
    },
  });

  const logo = ayar.logo
    ? {
      veri: ayar.logo.resim.slice(ayar.logo.resim.indexOf(",") + 1),
      xMm: ayar.logo.xMm,
      yMm: ayar.logo.yMm,
      genislikMm: ayar.logo.genislikMm,
      yukseklikMm: ayar.logo.yukseklikMm,
    }
    : null;

  return {
    ayar,
    belge: {
      genislikMm: ayar.genislikMm,
      yukseklikMm: ayar.yukseklikMm,
      adet: ayar.adet,
      satirlar,
      ayirac,
      logo,
    },
  };
}

/** TSPL BITMAP'te 0 = siyah nokta; arayüzün ürettiği bitmap ters çevrilir. */
const tsplBitmapBaytlari = (bitmap) => Buffer.from(Buffer.from(bitmap.veri, "base64").map((b) => ~b & 0xff));

/** Etiket + ayar → yazıcıya ham gönderilecek Buffer. */
function uret(etiket, hamAyar) {
  const ayar = ayarNormalize(hamAyar);
  const komut = ayar.dil === "TSPL" ? tsplUret(etiket, ayar) : zplUret(etiket, ayar);
  const kodla = (m) => (ayar.asciiyeIndir ? Buffer.from(m, "ascii") : cp857(m));
  const [once, sonra] = komut.split(BITMAP_ISARETI);
  if (sonra === undefined) return { ayar, metin: komut, veri: kodla(komut) };
  const bitmap = tsplBitmapBaytlari(ayar.logo.bitmap);
  return {
    ayar,
    metin: komut.replace(BITMAP_ISARETI, `<${bitmap.length} bayt logo>`),
    veri: Buffer.concat([kodla(once), bitmap, kodla(sonra)]),
  };
}

/** Birden çok etiketi tek işe birleştirir — yazıcı sırayla basar. */
function coklUret(etiketler, hamAyar) {
  const parcalar = (etiketler || []).map((e) => uret(e, hamAyar));
  return {
    ayar: ayarNormalize(hamAyar),
    metin: parcalar.map((p) => p.metin).join(""),
    veri: Buffer.concat(parcalar.map((p) => p.veri)),
    adet: parcalar.length,
  };
}

const ORNEK_ETIKET = {
  servisNo: "SRV-00001",
  musteri: "ÖRNEK BİLİŞİM SAN. TİC. LTD. ŞTİ.",
  telefon: "0532 123 45 67",
  cins: "Yazıcı",
  marka: "HP",
  model: "LaserJet M404dn",
  seriNo: "VNB3K12345",
  ariza: "Kağıt sıkışıyor, çıktıda dikey siyah çizgi var",
  kabulTarihi: "02.09.2026",
  sira: "1/2",
};

module.exports = {
  VARSAYILAN, BOYUTLAR, ORNEK_ETIKET, REFERANS_YUKSEKLIK_MM,
  olcekBul, tsplFontSec,
  ayarNormalize, logoNormalize, temizle, asciiyeIndir, cp857, sardir, satirlar, belgeUret,
  zplUret, tsplUret, uret, coklUret,
};
