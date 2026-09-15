import { useState } from "react";

/**
 * Excel benzeri ızgaraların ortak sıralama + sütun filtresi.
 *
 * Sütun tanımı:
 *   anahtar     benzersiz ad (sıralama/filtre anahtarı)
 *   baslik      başlık metni
 *   deger(r)    sıralama değeri (sayı, tarih zaman damgası veya metin)
 *   metin(r)    filtrede aranan metin (yoksa deger)
 *   tip         "metin" | "secim" — secim açılır liste filtresi gösterir
 *   secenekler  [{ deger, ad }] (secim için)
 *   siralanmaz / filtresiz
 */

const TR = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", I: "i", İ: "i", i: "i",
  ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u", â: "a", Â: "a", î: "i", û: "u",
};

export function normalize(s) {
  let out = "";
  for (const ch of String(s ?? "")) out += TR[ch] ?? ch;
  return out.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const trSirala = new Intl.Collator("tr", { sensitivity: "base", numeric: true });
const bosMu = (v) => v === null || v === undefined || v === "" || Number.isNaN(v);
const degerAl = (s, r) => (s.deger ? s.deger(r) : r[s.anahtar]);
const metinAl = (s, r) => String((s.metin ? s.metin(r) : degerAl(s, r)) ?? "");

export const tarihDegeri = (d) => (d ? new Date(d).getTime() : null);

export function siralaFiltrele(kayitlar, sutunlar, { sirala, yon, filtreler = {} }) {
  const aktif = sutunlar
    .filter((s) => !bosMu(filtreler[s.anahtar]))
    .map((s) => ({
      s,
      aranan: s.tip === "secim" ? String(filtreler[s.anahtar]) : normalize(filtreler[s.anahtar]).split(" ").filter(Boolean),
    }));

  let sonuc = kayitlar;
  if (aktif.length) {
    sonuc = kayitlar.filter((r) => aktif.every(({ s, aranan }) => {
      if (s.tip === "secim") return String(degerAl(s, r) ?? "") === aranan;
      const hedef = normalize(metinAl(s, r));
      return aranan.every((parca) => hedef.includes(parca));
    }));
  }

  const sutun = sutunlar.find((s) => s.anahtar === sirala);
  if (!sutun) return sonuc;
  const carpan = yon === "desc" ? -1 : 1;
  return [...sonuc].sort((a, b) => {
    const av = degerAl(sutun, a);
    const bv = degerAl(sutun, b);
    // Boş hücreler yönden bağımsız hep sonda.
    if (bosMu(av) || bosMu(bv)) return bosMu(av) === bosMu(bv) ? 0 : bosMu(av) ? 1 : -1;
    const fark = typeof av === "number" && typeof bv === "number" ? av - bv : trSirala.compare(String(av), String(bv));
    return fark * carpan;
  });
}

export function useTablo({ sirala: ilkSirala = null, yon: ilkYon = "asc" } = {}) {
  const [sirala, setSirala] = useState(ilkSirala);
  const [yon, setYon] = useState(ilkYon);
  const [filtreler, setFiltreler] = useState({});
  return {
    sirala,
    yon,
    filtreler,
    filtreVar: Object.values(filtreler).some((v) => !bosMu(v)),
    siralamaDegistir(anahtar) {
      if (anahtar === sirala) setYon((y) => (y === "asc" ? "desc" : "asc"));
      else {
        setSirala(anahtar);
        setYon("asc");
      }
    },
    filtreDegistir: (anahtar, deger) => setFiltreler((f) => ({ ...f, [anahtar]: deger })),
    filtreleriTemizle: () => setFiltreler({}),
  };
}
