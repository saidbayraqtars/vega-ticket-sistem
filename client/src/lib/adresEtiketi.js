import { barkodSvg } from "./code128";

/**
 * Tasarlanabilir A5 adres etiketi. Her öğe (gönderen, alıcı, logo, "dikkat
 * kırılır" işareti…) sayfanın sol üst köşesinden mm cinsinden konumlanır.
 * Aynı HTML hem tasarım ekranındaki önizlemede hem baskıda kullanılır; ekranda
 * görülen yerleşim kâğıda aynen çıkar.
 */

export const SAYFA = { yatay: { genislik: 210, yukseklik: 148 }, dikey: { genislik: 148, yukseklik: 210 } };

export const OGE_TANIMLARI = [
  { anahtar: "gonderen", ad: "Gönderen", tur: "kutu", ustYazi: "GÖNDEREN" },
  { anahtar: "alici", ad: "Alıcı", tur: "kutu", ustYazi: "ALICI" },
  { anahtar: "logo", ad: "Logo", tur: "resim" },
  { anahtar: "dikkat", ad: "Dikkat kırılır işareti", tur: "resim" },
  { anahtar: "bilgi", ad: "Servis no · kargo · takip no satırı", tur: "metin" },
  { anahtar: "barkod", ad: "Servis no barkodu", tur: "barkod" },
  { anahtar: "icerik", ad: "Cihaz listesi", tur: "metin" },
];

const KUTU = { cerceve: true, ustYazi: false };
const VARSAYILAN_KONUMLAR = {
  yatay: {
    gonderen: { gorunur: true, x: 10, y: 20, genislik: 90, yazi: 12, baslikYazi: 15, ...KUTU },
    alici: { gorunur: true, x: 101, y: 64, genislik: 97, yazi: 11.5, baslikYazi: 13, ...KUTU },
    logo: { gorunur: true, x: 116, y: 22, genislik: 66 },
    dikkat: { gorunur: true, x: 30, y: 76, genislik: 45 },
    bilgi: { gorunur: true, x: 10, y: 137, genislik: 190, yazi: 8 },
    barkod: { gorunur: false, x: 10, y: 122, genislik: 60 },
    icerik: { gorunur: false, x: 10, y: 122, genislik: 85, yazi: 8 },
  },
  dikey: {
    gonderen: { gorunur: true, x: 10, y: 12, genislik: 80, yazi: 11, baslikYazi: 14, ...KUTU },
    alici: { gorunur: true, x: 10, y: 72, genislik: 128, yazi: 14, baslikYazi: 17, ...KUTU },
    logo: { gorunur: true, x: 96, y: 14, genislik: 44 },
    dikkat: { gorunur: true, x: 10, y: 150, genislik: 38 },
    bilgi: { gorunur: true, x: 10, y: 199, genislik: 128, yazi: 8 },
    barkod: { gorunur: false, x: 60, y: 152, genislik: 75 },
    icerik: { gorunur: false, x: 56, y: 152, genislik: 82, yazi: 8 },
  },
};

export const varsayilanTasarim = (yon = "yatay") => ({
  yon,
  logo: null,
  ogeler: JSON.parse(JSON.stringify(VARSAYILAN_KONUMLAR[yon] || VARSAYILAN_KONUMLAR.yatay)),
});

const sinirla = (deger, alt, ust, varsayilan) => {
  const n = Number(String(deger ?? "").replace(",", "."));
  return Number.isFinite(n) && String(deger ?? "").trim() !== "" ? Math.min(Math.max(n, alt), ust) : varsayilan;
};

/** Kayıtlı (veya eski/bozuk) tasarımı varsayılanlarla tamamlar, değerleri sayfaya sığdırır. */
export function tasarimNormalize(ham) {
  const yon = ham?.yon === "dikey" ? "dikey" : "yatay";
  const sayfa = SAYFA[yon];
  const temel = VARSAYILAN_KONUMLAR[yon];
  const ogeler = {};
  for (const { anahtar, tur } of OGE_TANIMLARI) {
    const v = temel[anahtar];
    const h = ham?.ogeler?.[anahtar] || {};
    const oge = {
      gorunur: typeof h.gorunur === "boolean" ? h.gorunur : v.gorunur,
      x: sinirla(h.x, 0, sayfa.genislik - 5, v.x),
      y: sinirla(h.y, 0, sayfa.yukseklik - 5, v.y),
      genislik: sinirla(h.genislik, 10, sayfa.genislik, v.genislik),
    };
    if (v.yazi !== undefined) oge.yazi = sinirla(h.yazi, 5, 40, v.yazi);
    if (tur === "kutu") {
      oge.baslikYazi = sinirla(h.baslikYazi, 5, 48, v.baslikYazi);
      oge.cerceve = typeof h.cerceve === "boolean" ? h.cerceve : v.cerceve;
      oge.ustYazi = typeof h.ustYazi === "boolean" ? h.ustYazi : v.ustYazi;
    }
    ogeler[anahtar] = oge;
  }
  const logo = typeof ham?.logo === "string" && ham.logo.startsWith("data:image/") ? ham.logo : null;
  return { yon, logo, ogeler };
}

/** Yön değişince öğeler yeni sayfanın varsayılan yerlerine alınır; görünürlük ve logo korunur. */
export function yonDegistir(tasarim, yon) {
  const yeni = varsayilanTasarim(yon);
  for (const anahtar of Object.keys(yeni.ogeler)) yeni.ogeler[anahtar].gorunur = tasarim.ogeler[anahtar]?.gorunur ?? yeni.ogeler[anahtar].gorunur;
  return { ...yeni, logo: tasarim.logo };
}

// Mavi "DİKKAT KIRILIR" işareti: kırık kadeh. Harici dosya gerektirmesin diye gömülü.
export const DIKKAT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="display:block;width:100%;height:auto">
<rect x="2" y="2" width="96" height="96" rx="12" fill="#1d5ea8"/>
<rect x="6.5" y="6.5" width="87" height="87" rx="9" fill="none" stroke="#fff" stroke-width="2.4"/>
<path d="M33 13 H67 L64 33 Q61 46 50 47 Q39 46 36 33 Z" fill="#fff"/>
<path d="M52 14 L47 24 L54 29 L48 38" fill="none" stroke="#1d5ea8" stroke-width="2.6" stroke-linejoin="round"/>
<rect x="48.4" y="46.5" width="3.2" height="10.5" fill="#fff"/>
<rect x="39" y="56.5" width="22" height="3.2" rx="1.6" fill="#fff"/>
<text x="50" y="77" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="15" fill="#fff" textLength="70" lengthAdjust="spacingAndGlyphs">DİKKAT</text>
<text x="50" y="92" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="15" fill="#fff" textLength="74" lengthAdjust="spacingAndGlyphs">KIRILIR</text>
</svg>`;

export const ADRES_ETIKETI_CSS = `
  .ae-sayfa { position: relative; overflow: hidden; background: #fff; color: #000;
    font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ae-sayfa * { box-sizing: border-box; }
  .ae-oge { position: absolute; line-height: 1.22; overflow-wrap: anywhere; }
  .ae-kutu.ae-cerceve { background: #fff; border: 0.3mm solid #555; box-shadow: 1.8mm 1.8mm 0 #8c8c8c; padding: 1.6mm 2.6mm 2mm; }
  .ae-ust { font-size: 6.5pt; font-weight: 700; letter-spacing: 0.8pt; color: #333; }
  .ae-baslik { font-weight: 700; border-bottom: 0.3mm solid #000; margin-bottom: 0.8mm; padding-bottom: 0.3mm; }
  .ae-kalin { font-weight: 700; }
  .ae-resim img, .ae-resim svg { display: block; width: 100%; height: auto; }
  .ae-bos-logo { border: 0.4mm dashed #9aa3ad; color: #6b7480; font-size: 10pt; display: flex; align-items: center; justify-content: center; }
  .ae-onizleme { cursor: move; outline: 0.25mm dashed transparent; outline-offset: 0.6mm; }
  .ae-onizleme:hover { outline-color: #93b4df; }
  .ae-secili, .ae-secili:hover { outline: 0.45mm solid #2563eb; }
`;

/** Tarayıcı yazdırmasında sayfa ölçüsü; tek sayfaya sığsın diye gövde de aynı boyda kırpılır. */
export function sayfaCss(tasarim) {
  const { genislik, yukseklik } = SAYFA[tasarim.yon];
  return `@page { size: A5 ${tasarim.yon === "dikey" ? "portrait" : "landscape"}; margin: 0; }
  html, body { width: ${genislik}mm; height: ${yukseklik}mm; margin: 0; overflow: hidden; }`;
}

const kacis = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const temiz = (s) => String(s ?? "").trim();
const cokSatir = (s) => kacis(temiz(s)).replace(/\r?\n+/g, "<br>");
const tarihTR = (d) => (d ? new Date(d).toLocaleDateString("tr-TR") : "");
const cihazAdi = (c) => [c.CINS, [c.MARKA, c.MODEL].filter(Boolean).join(" ")].filter(Boolean).join(": ") || "Cihaz";

/** Etiketteki kurgusal örnek (tasarım önizlemesi ve örnek baskı). */
export const ORNEK_KAYIT = {
  SERVISNO: "SRV-000123",
  CARIADI: "Örnek Teknoloji A.Ş.",
  cihazlar: [
    { SIRA: 1, CINS: "Yazıcı", MARKA: "HP", MODEL: "LaserJet M404dn", SERINO: "VNB3K12345" },
    { SIRA: 2, CINS: "Yazarkasa", MARKA: "Profilo", MODEL: "PF-500", SERINO: "PF50012" },
  ],
};
export const ORNEK_GONDERIM = {
  TUR: "KARGO",
  ALICIADI: "ÖRNEK TEKNOLOJİ A.Ş.",
  ALICIYETKILI: "Ayşe Demir",
  ALICIADRES: "Cumhuriyet Mah. Atatürk Cad. No:12 Kat:3",
  ALICIIL: "Çankaya / ANKARA",
  ALICITELEFON: "0312 000 00 00",
  KARGOFIRMASI: "Yurtiçi Kargo",
  TAKIPNO: "123456789012",
  TARIH: new Date(),
};
export const ORNEK_GONDEREN = {
  ad: "Firma Adınız",
  yetkili: "Yetkili Adı",
  adres: "Mahalle, cadde ve kapı no",
  il: "İlçe / İL",
  telefon: "0500 000 00 00",
  eposta: "info@firmaniz.com",
};

/**
 * Etiket sayfasının HTML'i. `onizleme` açıkken öğeler sürüklenebilir işaretlenir
 * ve logo yüklenmemişse yeri kesik çizgili kutuyla gösterilir.
 */
export function adresEtiketiSayfasi({ kayit, gonderim, gonderen, tasarim: ham, onizleme = false, secili = null }) {
  const tasarim = tasarimNormalize(ham);
  const { genislik, yukseklik } = SAYFA[tasarim.yon];
  const ariza = gonderim?.TUR === "ARIZA";
  const parcalar = [];

  const oge = (anahtar, sinif, stil, icerik) => {
    const siniflar = ["ae-oge", sinif, onizleme && "ae-onizleme", onizleme && secili === anahtar && "ae-secili"].filter(Boolean);
    const veri = onizleme ? ` data-oge="${anahtar}"` : "";
    parcalar.push(`<div class="${siniflar.join(" ")}"${veri} style="${stil}">${icerik}</div>`);
  };
  const konum = (o) => `left:${o.x}mm;top:${o.y}mm;width:${o.genislik}mm;`;

  const kutu = (anahtar, ustYazi, baslik, satirlar) => {
    const o = tasarim.ogeler[anahtar];
    if (!o.gorunur) return;
    const icerik = [
      o.ustYazi ? `<div class="ae-ust">${ustYazi}</div>` : "",
      `<div class="ae-baslik" style="font-size:${o.baslikYazi}pt">${kacis(baslik) || "&nbsp;"}</div>`,
      ...satirlar.filter(Boolean).map((s) => `<div>${s}</div>`),
    ].join("");
    oge(anahtar, `ae-kutu${o.cerceve ? " ae-cerceve" : ""}`, `${konum(o)}font-size:${o.yazi}pt`, icerik);
  };

  kutu("gonderen", "GÖNDEREN", gonderen?.ad, [
    kacis(temiz(gonderen?.yetkili)),
    cokSatir(gonderen?.adres),
    kacis(temiz(gonderen?.il)),
    temiz(gonderen?.telefon) && `Tel: ${kacis(temiz(gonderen.telefon))}`,
    temiz(gonderen?.eposta) && `E-posta: ${kacis(temiz(gonderen.eposta))}`,
  ]);

  kutu("alici", "ALICI", gonderim?.ALICIADI, [
    kacis(temiz(gonderim?.ALICIYETKILI)),
    cokSatir(gonderim?.ALICIADRES),
    temiz(gonderim?.ALICIIL) && `<span class="ae-kalin">${kacis(temiz(gonderim.ALICIIL))}</span>`,
    temiz(gonderim?.ALICITELEFON) && `Tel: ${kacis(temiz(gonderim.ALICITELEFON))}`,
  ]);

  const logo = tasarim.ogeler.logo;
  if (logo.gorunur && tasarim.logo) {
    oge("logo", "ae-resim", konum(logo), `<img src="${kacis(tasarim.logo)}" alt="">`);
  } else if (logo.gorunur && onizleme) {
    oge("logo", "ae-bos-logo", `${konum(logo)}height:${Math.round(logo.genislik * 0.4)}mm`, "LOGO — sağdan yükleyin");
  }

  const dikkat = tasarim.ogeler.dikkat;
  if (dikkat.gorunur) oge("dikkat", "ae-resim", konum(dikkat), DIKKAT_SVG);

  const bilgi = tasarim.ogeler.bilgi;
  if (bilgi.gorunur) {
    const takip = temiz(gonderim?.TAKIPNO);
    const metin = [
      ariza ? "ARIZA GÖNDERİMİ" : "KARGO GÖNDERİMİ",
      kayit?.SERVISNO,
      tarihTR(gonderim?.TARIH || new Date()),
      temiz(gonderim?.KARGOFIRMASI) && `Kargo: ${temiz(gonderim.KARGOFIRMASI)}`,
      takip && `Takip no: ${takip}`,
    ].filter(Boolean).map(kacis).join(" · ");
    oge("bilgi", "", `${konum(bilgi)}font-size:${bilgi.yazi}pt`, metin);
  }

  const barkod = tasarim.ogeler.barkod;
  if (barkod.gorunur && kayit?.SERVISNO) {
    oge("barkod", "ae-resim", konum(barkod),
      barkodSvg(kayit.SERVISNO, { modul: 0.5, enFazlaGenislik: barkod.genislik, yukseklik: 12, yaziBoyu: 3 }));
  }

  const icerik = tasarim.ogeler.icerik;
  if (icerik.gorunur) {
    const satirlar = (kayit?.cihazlar || []).map((c) =>
      `<div>${kacis(c.SIRA)}. ${kacis(cihazAdi(c))}${c.SERINO ? ` · S/N: ${kacis(c.SERINO)}` : ""}</div>`);
    oge("icerik", "", `${konum(icerik)}font-size:${icerik.yazi}pt`,
      `<div class="ae-kalin">Paket içeriği</div>${satirlar.join("") || "<div>—</div>"}`);
  }

  return `<div class="ae-sayfa" style="width:${genislik}mm;height:${yukseklik}mm">${parcalar.join("")}</div>`;
}

/**
 * Seçilen resmi etikete gömülecek boyuta indirir. SVG olduğu gibi kalır;
 * diğerleri en çok `enFazlaPx` kenarlı PNG'ye çevrilir (saydamlık korunur).
 */
export function logoHazirla(dosya, { enFazlaPx = 900, enFazlaKarakter = 1_000_000 } = {}) {
  return new Promise((cozumle, reddet) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(dosya?.type || "")) {
      reddet(new Error("Logo PNG, JPG, WEBP veya SVG olmalı."));
      return;
    }
    const okuyucu = new FileReader();
    okuyucu.onerror = () => reddet(new Error("Resim okunamadı."));
    okuyucu.onload = () => {
      const kaynak = String(okuyucu.result);
      if (dosya.type === "image/svg+xml") {
        if (kaynak.length > enFazlaKarakter) reddet(new Error("SVG logo çok büyük."));
        else cozumle(kaynak);
        return;
      }
      const resim = new Image();
      resim.onerror = () => reddet(new Error("Resim açılamadı."));
      resim.onload = () => {
        const oran = Math.min(1, enFazlaPx / Math.max(resim.naturalWidth, resim.naturalHeight));
        const tuval = document.createElement("canvas");
        tuval.width = Math.max(1, Math.round(resim.naturalWidth * oran));
        tuval.height = Math.max(1, Math.round(resim.naturalHeight * oran));
        tuval.getContext("2d").drawImage(resim, 0, 0, tuval.width, tuval.height);
        const png = tuval.toDataURL("image/png");
        if (png.length > enFazlaKarakter) reddet(new Error("Logo çok büyük. Daha küçük bir resim seçin."));
        else cozumle(png);
      };
      resim.src = kaynak;
    };
    okuyucu.readAsDataURL(dosya);
  });
}
