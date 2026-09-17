const { BILDIRIM_TELEFON_SINIRI, normalizeTelefon, telefonlariAyikla, cariTelefonlari } = require("./telefon");
const { SURESI_DOLDU, SURE_HATASI, sablonDogrula, degiskenleriYerlestir } = require("./whatsappBildirim");

/**
 * Servis kaydından müşteriye isteğe bağlı gönderilen WhatsApp mesajları.
 * İşlem kaydının aksine hiçbir mesaj kendiliğinden gitmez: kullanıcı türü
 * seçer, metni görüp düzenler, numaraları işaretler ve gönderir.
 */
const SERVIS_MESAJ_TURLERI = [
  { kod: "KABUL", ad: "Cihaz kabul edildi" },
  { kod: "HAZIR", ad: "Teslime hazır" },
  { kod: "ARIZA", ad: "Yetkili servise gönderildi" },
  { kod: "KARGO", ad: "Kargoya verildi" },
  { kod: "TESLIM", ad: "Teslim edildi" },
  { kod: "GENEL", ad: "Genel bilgilendirme" },
];
const TUR_KODLARI = new Set(SERVIS_MESAJ_TURLERI.map((t) => t.kod));

const VARSAYILAN_SERVIS_SABLONLARI = {
  KABUL: "Merhaba {firma}, {cihaz} cihazınız {servisno} numarasıyla servisimize kabul edilmiştir. Gelişmeleri size bildireceğiz. İyi günler dileriz.",
  HAZIR: "Merhaba {firma}, {servisno} numaralı {cihaz} cihazınızın işlemleri tamamlanmış olup teslime hazırdır. İyi günler dileriz.",
  ARIZA: "Merhaba {firma}, {servisno} numaralı {cihaz} cihazınız incelenmek üzere yetkili servise gönderilmiştir. Gelişmeleri size bildireceğiz.",
  KARGO: "Merhaba {firma}, {servisno} numaralı {cihaz} cihazınız {kargo} ile kargoya verilmiştir. Takip no: {takipno}. İyi günler dileriz.",
  TESLIM: "Merhaba {firma}, {servisno} numaralı {cihaz} cihazınız teslim edilmiştir. Bizi tercih ettiğiniz için teşekkür ederiz.",
  GENEL: "Merhaba {firma}, {servisno} numaralı servis kaydınızla ilgili bilgilendirme:",
};

const SERVIS_MESAJ_DEGISKENLERI = [
  "{firma}", "{ad}", "{unvan}", "{kod}", "{carikodu}", "{servisno}", "{cihaz}", "{serino}",
  "{yetkili}", "{kargo}", "{takipno}", "{kabultarihi}", "{tarih}", "{kullanici}",
];
const DEGISKEN_ADLARI = new Set(SERVIS_MESAJ_DEGISKENLERI.map((x) => x.slice(1, -1)));

/** Şablonlar ORTAKAYARLAR'da tür başına ayrı anahtardır; iki kişi farklı türü düzenlerken birbirini ezmez. */
const SABLON_ONEKI = "SERVIS_WHATSAPP_SABLONU_";
const sablonAnahtari = (tur) => `${SABLON_ONEKI}${tur}`;

/** Aynı metnin çift tıklamayla müşteriye iki kez gitmesini önleyen süre. */
const TEKRAR_KORUMA_SN = 120;

// Süresi dolduğu hâlde ana bilgisayar kapalı olduğu için henüz kapatılmamış
// satır listede iptal görünür ve tekrar gönderilebilir.
const SURESI_GECTI = `DURUM IN ('BEKLIYOR','HATA') AND ${SURESI_DOLDU}`;
const SERVIS_MESAJ_SUTUNLARI = `ID, SERVISID, MESAJTURU, TELEFON, TELEFONLAR, GONDERILENLER, METIN,
  CASE WHEN ${SURESI_GECTI} THEN 'IPTAL' ELSE DURUM END AS DURUM,
  CASE WHEN ${SURESI_GECTI} THEN '${SURE_HATASI}' ELSE SONHATA END AS SONHATA,
  DENEME, MESAJID, GONDEREN, KAYITTARIHI, GONDERIMTARIHI`;

const servisSablonuDogrula = (sablon) => sablonDogrula(sablon, DEGISKEN_ADLARI);

const metin = (deger) => String(deger ?? "").trim();
const benzersiz = (liste) => [...new Set(liste.filter(Boolean))];
const tarihTR = (deger) => {
  if (!deger) return "";
  const d = deger instanceof Date ? deger : new Date(deger);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("tr-TR");
};

/** "HP LaserJet M404dn, Epson L3150" — marka/model yoksa cins. */
function cihazOzeti(cihazlar) {
  return benzersiz((cihazlar || []).map((c) =>
    [metin(c.MARKA), metin(c.MODEL)].filter(Boolean).join(" ") || metin(c.CINS))).join(", ");
}

/** Servis kaydını (cihazlar ve en yeni gönderim başta olmak üzere) şablona yerleştirir. */
function servisMesajiDoldur(sablon, kayit = {}, { kullanici = "", tarih = new Date() } = {}) {
  const gecerli = servisSablonuDogrula(sablon);
  if (!gecerli) return null;
  const musteri = metin(kayit.CARIADI);
  const sonGonderim = kayit.gonderimler?.[0] || {};
  const degerler = {
    firma: musteri,
    ad: musteri,
    unvan: musteri,
    kod: metin(kayit.CARIKODU),
    carikodu: metin(kayit.CARIKODU),
    servisno: metin(kayit.SERVISNO),
    cihaz: cihazOzeti(kayit.cihazlar),
    serino: benzersiz((kayit.cihazlar || []).map((c) => metin(c.SERINO))).join(", "),
    yetkili: metin(kayit.YETKILI),
    kargo: metin(sonGonderim.KARGOFIRMASI),
    takipno: metin(sonGonderim.TAKIPNO),
    kabultarihi: tarihTR(kayit.KABULTARIHI),
    tarih: tarihTR(tarih),
    kullanici: metin(kullanici),
  };
  return degiskenleriYerlestir(gecerli, degerler).trim().slice(0, 1000);
}

/**
 * Gönderim penceresinde işaretlenecek numaralar: önce servis kaydındaki
 * (cihazı getirenin) telefon, sonra cari kartındaki cep numaraları.
 */
function servisTelefonAdaylari(kayit, kart) {
  const adaylar = [];
  const ekle = (telefon, kaynak) => {
    if (!adaylar.some((a) => a.telefon === telefon)) adaylar.push({ telefon, kaynak });
  };
  for (const telefon of telefonlariAyikla(kayit?.TELEFON)) ekle(telefon, "servis");
  for (const telefon of cariTelefonlari(kart || {}, 6)) ekle(telefon, "cari");
  return adaylar;
}

/** Kullanıcının seçtiği numaraları doğrular: hepsi cep, tekrarsız, en çok üç. */
function aliciTelefonlari(liste) {
  const ham = (Array.isArray(liste) ? liste : String(liste ?? "").split(",")).map(metin).filter(Boolean);
  const telefonlar = [];
  for (const deger of ham) {
    const telefon = normalizeTelefon(deger);
    if (!telefon) return { hata: `Geçersiz cep telefonu: ${deger}` };
    if (!telefonlar.includes(telefon)) telefonlar.push(telefon);
  }
  if (!telefonlar.length) return { hata: "Mesajın gideceği en az bir cep telefonu seçin." };
  if (telefonlar.length > BILDIRIM_TELEFON_SINIRI) {
    return { hata: `Mesaj en çok ${BILDIRIM_TELEFON_SINIRI} numaraya gönderilebilir.` };
  }
  return { telefonlar };
}

module.exports = {
  SERVIS_MESAJ_TURLERI,
  TUR_KODLARI,
  VARSAYILAN_SERVIS_SABLONLARI,
  SERVIS_MESAJ_DEGISKENLERI,
  SABLON_ONEKI,
  TEKRAR_KORUMA_SN,
  SERVIS_MESAJ_SUTUNLARI,
  sablonAnahtari,
  servisSablonuDogrula,
  cihazOzeti,
  servisMesajiDoldur,
  servisTelefonAdaylari,
  aliciTelefonlari,
};
