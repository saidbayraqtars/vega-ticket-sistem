const TABAN = import.meta.env.VITE_API ?? "";

let kullanici = localStorage.getItem("vt.kullanici") || "";
// PIN oturumu uygulama kapanınca düşsün diye sessionStorage'da tutulur.
let oturum = sessionStorage.getItem("vt.oturum") || "";

export function kullaniciAyarla(ad) {
  kullanici = ad || "";
  localStorage.setItem("vt.kullanici", kullanici);
}
export const kullaniciAl = () => kullanici;

export function oturumAyarla(belirtec) {
  oturum = belirtec || "";
  if (oturum) sessionStorage.setItem("vt.oturum", oturum);
  else sessionStorage.removeItem("vt.oturum");
}

/** Sunucu PIN girişi isterse uygulama giriş ekranını açar. */
export const GIRIS_GEREKLI_OLAYI = "vt:giris-gerekli";

async function istek(yol, secenekler = {}) {
  const yanit = await fetch(TABAN + yol, {
    ...secenekler,
    headers: {
      "Content-Type": "application/json",
      // HTTP başlıkları yalnız ISO-8859-1 taşır; Türkçe karakterli ad
      // (Ş, ğ, İ...) ham gönderilirse fetch hata fırlatır. Sunucu çözer.
      ...(kullanici ? { "x-kullanici": encodeURIComponent(kullanici) } : {}),
      ...(oturum ? { "x-oturum": oturum } : {}),
      ...(secenekler.headers || {}),
    },
  });

  let govde = null;
  try {
    govde = await yanit.json();
  } catch {
    govde = { ok: false, mesaj: `Sunucu yanıtı okunamadı (HTTP ${yanit.status})` };
  }

  if (!yanit.ok) {
    if (yanit.status === 401 && govde?.girisGerekli) {
      window.dispatchEvent(new CustomEvent(GIRIS_GEREKLI_OLAYI));
    }
    const hata = new Error(govde?.mesaj || `HTTP ${yanit.status}`);
    hata.durum = yanit.status;
    hata.govde = govde;
    throw hata;
  }
  return govde;
}

const qs = (nesne) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(nesne)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, v);
  }
  const s = p.toString();
  return s ? "?" + s : "";
};

const govdeli = (method, veri) => ({ method, body: JSON.stringify(veri) });

export const api = {
  saglik: () => istek("/api/saglik"),

  kurulumDurum: () => istek("/api/kurulum/durum"),
  kurulumTest: (config) => istek("/api/kurulum/test", govdeli("POST", config)),
  kurulumKaydet: (config) => istek("/api/kurulum/kaydet", govdeli("POST", config)),
  kurulumIceAktar: () => istek("/api/kurulum/iceaktar", { method: "POST" }),
  firmalar: () => istek("/api/kurulum/firmalar"),
  secimKaydet: (secim) => istek("/api/kurulum/secim", govdeli("POST", secim)),
  kullanicilar: () => istek("/api/kurulum/kullanicilar"),

  kullaniciListe: () => istek("/api/kullanici/liste"),
  oturumDurum: () => istek("/api/kullanici/oturum"),
  giris: (veri) => istek("/api/kullanici/giris", govdeli("POST", veri)),
  cikis: () => istek("/api/kullanici/cikis", { method: "POST" }),
  pinKaydet: (veri) => istek("/api/kullanici/pin", govdeli("POST", veri)),

  cariListe: (p) => istek("/api/cari/liste" + qs(p)),
  cariAra: (p) => istek("/api/cari/ara" + qs(p)),
  cariDetay: (ind, p) => istek(`/api/cari/${ind}` + qs(p)),
  cariSureKaydet: (ind, veri) => istek(`/api/cari/${ind}/sure`, govdeli("PUT", veri)),
  cariSureSil: (ind, p) => istek(`/api/cari/${ind}/sure` + qs(p), { method: "DELETE" }),
  turler: (p) => istek("/api/cari/turler" + qs(p)),

  ticketListe: (p) => istek("/api/ticket" + qs(p)),
  ticketOzet: (p) => istek("/api/ticket/ozet" + qs(p)),
  ticketDegisiklikler: (p) => istek("/api/ticket/degisiklikler" + qs(p)),
  ticketOlustur: (t) => istek("/api/ticket", govdeli("POST", t)),
  ticketOnayla: (id) => istek(`/api/ticket/${id}/onayla`, { method: "POST" }),
  ticketGuncelle: (id, yama) => istek(`/api/ticket/${id}`, govdeli("PATCH", yama)),
  ticketWhatsappGuncelle: (id, metin) => istek(`/api/ticket/${id}/whatsapp`, govdeli("PATCH", { METIN: metin })),
  ticketSil: (id) => istek(`/api/ticket/${id}`, { method: "DELETE" }),
  ticketLog: (id) => istek(`/api/ticket/${id}/log`),

  servisListe: (p) => istek("/api/servis" + qs(p)),
  servisDetay: (id) => istek(`/api/servis/${id}`),
  servisOlustur: (k) => istek("/api/servis", govdeli("POST", k)),
  servisGuncelle: (id, yama) => istek(`/api/servis/${id}`, govdeli("PATCH", yama)),
  servisSil: (id) => istek(`/api/servis/${id}`, { method: "DELETE" }),
  servisCihazEkle: (id, cihaz) => istek(`/api/servis/${id}/cihaz`, govdeli("POST", cihaz)),
  servisCihazGuncelle: (id, yama) => istek(`/api/servis/cihaz/${id}`, govdeli("PATCH", yama)),
  servisGonderim: (id, veri) => istek(`/api/servis/${id}/gonderim`, govdeli("POST", veri)),
  servisGonderimGuncelle: (id, yama) => istek(`/api/servis/gonderim/${id}`, govdeli("PATCH", yama)),
  servisGonderimAdresleri: (tur) => istek("/api/servis/gonderim/adresler" + qs({ tur })),
  servisMusteriAdres: (id) => istek(`/api/servis/${id}/musteri-adres`),
  servisGonderen: (firma) => istek("/api/servis/gonderen" + qs({ firma })),
  servisGonderenKaydet: (veri) => istek("/api/servis/gonderen", govdeli("POST", veri)),

  etiketYazicilar: () => istek("/api/etiket/yazicilar"),
  etiketAyar: () => istek("/api/etiket/ayar"),
  etiketAyarKaydet: (ayar) => istek("/api/etiket/ayar", govdeli("POST", ayar)),
  etiketOnizleme: (veri) => istek("/api/etiket/onizleme", govdeli("POST", veri)),
  etiketDene: (ayar) => istek("/api/etiket/dene", govdeli("POST", { ayar })),
  etiketDilDene: (ayar) => istek("/api/etiket/dil-dene", govdeli("POST", { ayar })),
  etiketBas: (veri) => istek("/api/etiket/bas", govdeli("POST", veri)),

  whatsappDurum: () => istek("/api/whatsapp/durum"),
  whatsappSablon: () => istek("/api/whatsapp/sablon"),
  whatsappSablonKaydet: (sablon) => istek("/api/whatsapp/sablon", govdeli("POST", { sablon })),
  whatsappSifirla: () => istek("/api/whatsapp/sifirla", { method: "POST" }),
  whatsappAnaYap: () => istek("/api/whatsapp/ana-yap", { method: "POST" }),
  whatsappMesajDurumu: (ticketId) => istek(`/api/whatsapp/mesaj/${ticketId}`),
  whatsappGonder: (veri) => istek("/api/whatsapp/gonder", govdeli("POST", veri)),
};
