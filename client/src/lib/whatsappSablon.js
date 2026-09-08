export const VARSAYILAN_MESAJ_SABLONU = "Merhaba, “{islem}” işlemi için uzak bağlantı ile sorununuz çözülmüştür. İyi günler dileriz.";

export const MESAJ_DEGISKENLERI = [
  "{firma}", "{ad}", "{unvan}", "{kod}", "{carikodu}",
  "{islem}", "{ucret}", "{tarih}", "{kullanici}",
];

export function mesajOnizle(sablon, veri = {}) {
  const musteri = String(veri.musteri || "");
  const degerler = {
    firma: musteri,
    ad: musteri,
    unvan: musteri,
    kod: String(veri.cariKodu || ""),
    carikodu: String(veri.cariKodu || ""),
    islem: String(veri.islem || ""),
    ucret: typeof veri.ucret === "number"
      ? veri.ucret.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(veri.ucret || "0,00"),
    tarih: new Date().toLocaleDateString("tr-TR"),
    kullanici: String(veri.kullanici || ""),
  };
  return String(sablon || "").replace(/\{([^{}]+)\}/g, (_tum, ad) => degerler[String(ad).toLocaleLowerCase("tr-TR")] ?? `{${ad}}`);
}
