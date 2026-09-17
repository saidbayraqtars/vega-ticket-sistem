/**
 * Termal etiket logosu. Windows sürücüsü yolu PNG'yi kendisi basar; ham komut
 * (ZPL/TSPL) yolu ise etiket çözünürlüğünde 1 bit/nokta bitmap ister. İkisi de
 * burada, tarayıcının canvas'ıyla üretilir.
 */

const resimAc = (kaynak) => new Promise((cozumle, reddet) => {
  const resim = new Image();
  resim.onload = () => cozumle(resim);
  resim.onerror = () => reddet(new Error("Resim açılamadı."));
  resim.src = kaynak;
});

const dosyaOku = (dosya) => new Promise((cozumle, reddet) => {
  const okuyucu = new FileReader();
  okuyucu.onload = () => cozumle(String(okuyucu.result));
  okuyucu.onerror = () => reddet(new Error("Resim okunamadı."));
  okuyucu.readAsDataURL(dosya);
});

/** Seçilen dosyayı (SVG dahil) en çok `enFazlaPx` kenarlı, beyaz zeminli PNG'ye çevirir. */
export async function termalLogoHazirla(dosya, enFazlaPx = 600) {
  if (!/^image\/(png|jpeg|webp|svg\+xml|bmp|gif)$/.test(dosya?.type || "")) {
    throw new Error("Logo PNG, JPG, WEBP, BMP veya SVG olmalı.");
  }
  const resim = await resimAc(await dosyaOku(dosya));
  const gen = resim.naturalWidth || 300;
  const yuk = resim.naturalHeight || 150;
  const oran = Math.min(1, enFazlaPx / Math.max(gen, yuk));
  const tuval = document.createElement("canvas");
  tuval.width = Math.max(1, Math.round(gen * oran));
  tuval.height = Math.max(1, Math.round(yuk * oran));
  const ctx = tuval.getContext("2d");
  // Termal kâğıtta saydamlık yok; saydam alan beyaz basılmalı.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, tuval.width, tuval.height);
  ctx.drawImage(resim, 0, 0, tuval.width, tuval.height);
  const png = tuval.toDataURL("image/png");
  if (png.length > 700000) throw new Error("Logo çok büyük. Daha küçük bir resim seçin.");
  return { resim: png, oran: tuval.height / tuval.width };
}

/**
 * PNG logoyu `genislikNokta` genişliğinde siyah-beyaz bitmap'e çevirir.
 * Satırlar ceil(genişlik/8) bayt, en soldaki bit 1 = siyah (ZPL ^GF düzeni).
 */
export async function logoBitmapUret(resimVeri, genislikNokta, esik = 150) {
  const resim = await resimAc(resimVeri);
  const genislik = Math.max(1, Math.round(genislikNokta));
  const yukseklik = Math.max(1, Math.round((genislik * resim.naturalHeight) / resim.naturalWidth));
  const tuval = document.createElement("canvas");
  tuval.width = genislik;
  tuval.height = yukseklik;
  const ctx = tuval.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, genislik, yukseklik);
  ctx.drawImage(resim, 0, 0, genislik, yukseklik);
  const { data } = ctx.getImageData(0, 0, genislik, yukseklik);
  const satirBayt = Math.ceil(genislik / 8);
  const bitler = new Uint8Array(satirBayt * yukseklik);
  for (let y = 0; y < yukseklik; y++) {
    for (let x = 0; x < genislik; x++) {
      const i = (y * genislik + x) * 4;
      const parlaklik = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (parlaklik < esik) bitler[y * satirBayt + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  let ikili = "";
  for (let i = 0; i < bitler.length; i += 0x8000) ikili += String.fromCharCode(...bitler.subarray(i, i + 0x8000));
  return { genislik, yukseklik, veri: btoa(ikili) };
}

/**
 * Kaydetmeden / basmadan önce logonun yüksekliğini oranına göre ve bitmap'ini
 * güncel genişlik + çözünürlükle yeniden üretir.
 */
export async function logoluAyarHazirla(ayar) {
  if (!ayar?.logo?.resim) return { ...ayar, logo: null };
  const resim = await resimAc(ayar.logo.resim);
  const genislikMm = Number(String(ayar.logo.genislikMm).replace(",", ".")) || 20;
  const yukseklikMm = Math.round(((genislikMm * resim.naturalHeight) / resim.naturalWidth) * 100) / 100;
  const dpi = Number(ayar.dpi) || 203;
  const bitmap = await logoBitmapUret(ayar.logo.resim, (genislikMm * dpi) / 25.4);
  return { ...ayar, logo: { ...ayar.logo, genislikMm, yukseklikMm, bitmap } };
}
