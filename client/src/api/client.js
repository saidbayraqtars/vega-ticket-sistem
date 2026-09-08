const TABAN = import.meta.env.VITE_API ?? "";

let kullanici = localStorage.getItem("vt.kullanici") || "";

export function kullaniciAyarla(ad) {
  kullanici = ad || "";
  localStorage.setItem("vt.kullanici", kullanici);
}
export const kullaniciAl = () => kullanici;

async function istek(yol, secenekler = {}) {
  const yanit = await fetch(TABAN + yol, {
    ...secenekler,
    headers: {
      "Content-Type": "application/json",
      ...(kullanici ? { "x-kullanici": kullanici } : {}),
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

export const api = {
  saglik: () => istek("/api/saglik"),

  kurulumDurum: () => istek("/api/kurulum/durum"),
  kurulumTest: (config) => istek("/api/kurulum/test", { method: "POST", body: JSON.stringify(config) }),
  kurulumKaydet: (config) => istek("/api/kurulum/kaydet", { method: "POST", body: JSON.stringify(config) }),
  kurulumIceAktar: () => istek("/api/kurulum/iceaktar", { method: "POST" }),
  firmalar: () => istek("/api/kurulum/firmalar"),
  secimKaydet: (secim) => istek("/api/kurulum/secim", { method: "POST", body: JSON.stringify(secim) }),
  kullanicilar: () => istek("/api/kurulum/kullanicilar"),

  cariListe: (p) => istek("/api/cari/liste" + qs(p)),
  cariAra: (p) => istek("/api/cari/ara" + qs(p)),
  cariDetay: (ind, p) => istek(`/api/cari/${ind}` + qs(p)),
  cariSureKaydet: (ind, veri) =>
    istek(`/api/cari/${ind}/sure`, { method: "PUT", body: JSON.stringify(veri) }),
  cariSureSil: (ind, p) => istek(`/api/cari/${ind}/sure` + qs(p), { method: "DELETE" }),
  turler: (p) => istek("/api/cari/turler" + qs(p)),

  ticketListe: (p) => istek("/api/ticket" + qs(p)),
  ticketOzet: (p) => istek("/api/ticket/ozet" + qs(p)),
  ticketDegisiklikler: (p) => istek("/api/ticket/degisiklikler" + qs(p)),
  ticketOlustur: (t) => istek("/api/ticket", { method: "POST", body: JSON.stringify(t) }),
  ticketOnayla: (id) => istek(`/api/ticket/${id}/onayla`, { method: "POST" }),
  ticketGuncelle: (id, yama) => istek(`/api/ticket/${id}`, { method: "PATCH", body: JSON.stringify(yama) }),
  ticketSil: (id) => istek(`/api/ticket/${id}`, { method: "DELETE" }),
  ticketLog: (id) => istek(`/api/ticket/${id}/log`),

  servisListe: (p) => istek("/api/servis" + qs(p)),
  servisDetay: (id) => istek(`/api/servis/${id}`),
  servisOlustur: (k) => istek("/api/servis", { method: "POST", body: JSON.stringify(k) }),
  servisGuncelle: (id, yama) => istek(`/api/servis/${id}`, { method: "PATCH", body: JSON.stringify(yama) }),
  servisSil: (id) => istek(`/api/servis/${id}`, { method: "DELETE" }),
  servisCihazEkle: (id, cihaz) => istek(`/api/servis/${id}/cihaz`, { method: "POST", body: JSON.stringify(cihaz) }),
  servisCihazGuncelle: (id, yama) => istek(`/api/servis/cihaz/${id}`, { method: "PATCH", body: JSON.stringify(yama) }),

  etiketYazicilar: () => istek("/api/etiket/yazicilar"),
  etiketAyar: () => istek("/api/etiket/ayar"),
  etiketAyarKaydet: (ayar) => istek("/api/etiket/ayar", { method: "POST", body: JSON.stringify(ayar) }),
  etiketOnizleme: (veri) => istek("/api/etiket/onizleme", { method: "POST", body: JSON.stringify(veri) }),
  etiketDene: (ayar) => istek("/api/etiket/dene", { method: "POST", body: JSON.stringify({ ayar }) }),
  etiketDilDene: (ayar) => istek("/api/etiket/dil-dene", { method: "POST", body: JSON.stringify({ ayar }) }),
  etiketBas: (veri) => istek("/api/etiket/bas", { method: "POST", body: JSON.stringify(veri) }),

  whatsappDurum: () => istek("/api/whatsapp/durum"),
  whatsappSablon: () => istek("/api/whatsapp/sablon"),
  whatsappSablonKaydet: (sablon) => istek("/api/whatsapp/sablon", { method: "POST", body: JSON.stringify({ sablon }) }),
  whatsappSifirla: () => istek("/api/whatsapp/sifirla", { method: "POST" }),
  whatsappAnaYap: () => istek("/api/whatsapp/ana-yap", { method: "POST" }),
  whatsappMesajDurumu: (ticketId) => istek(`/api/whatsapp/mesaj/${ticketId}`),
  whatsappGonder: (veri) => istek("/api/whatsapp/gonder", { method: "POST", body: JSON.stringify(veri) }),
};
