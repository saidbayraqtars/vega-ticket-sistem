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
  ticketGuncelle: (id, yama) => istek(`/api/ticket/${id}`, { method: "PATCH", body: JSON.stringify(yama) }),
  ticketSil: (id) => istek(`/api/ticket/${id}`, { method: "DELETE" }),
  ticketLog: (id) => istek(`/api/ticket/${id}/log`),
};
