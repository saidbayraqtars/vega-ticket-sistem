# Vega Ticket 1.9.1

## A5 çıktıda önizleme ve hazır A5 kâğıt ayarı

- **A5 adres etiketi**, **Barkod çıktısı (A5)** ve etiket tasarımındaki **Örnek yazdır** artık programın kendi yazdırma penceresini açar. Pencerede çıktının önizlemesi görünür.
- Kâğıt boyutu her baskıda **A5** olarak gönderilir; yön (yatay/dikey) etiket tasarımından alınır, ölçek %100'dür. Windows yazdırma penceresinde kâğıdı elle A5 yapmak gerekmez.
- Yazıcı ve adet bu pencereden seçilir. Seçilen yazıcı o bilgisayarda hatırlanır; ilk kullanımda Windows varsayılan yazıcısı seçili gelir.
- Esc yalnız yazdırma penceresini kapatır; alttaki gönderim veya tasarım penceresi açık kalır.
- Yazıcıya A5 kâğıt takılı olmalıdır. Yazıcı işi kabul etmezse neden pencerede gösterilir.

## Teknik notlar

- Electron'da `window.print()` önizlemesiz Windows penceresini açtığı ve kâğıdı yazıcının varsayılanında bıraktığı için baskı ana süreçte yapılır: sayfa gizli pencereye yüklenir, `webContents.print` ile `pageSize: "A5"` verilerek sessiz basılır (`desktop/a5Yazdir.js`, `desktop/preload.js`).
- Barkod sayfasında kartlar sabit 132 mm yerine sayfanın kullanılabilir genişliğine yayılır.
- Tarayıcıdan açılan arayüzde (geliştirme) tarayıcının kendi yazdırma penceresi kullanılmaya devam eder.
- Sunucu testleri 112/112 başarılıdır.
