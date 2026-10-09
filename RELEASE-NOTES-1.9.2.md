# Vega Ticket 1.9.2

## A5 çıktı A4 kâğıdın yarısına

- Yazdırma penceresine **Kâğıt** seçimi geldi: **A4'ün yarısı** ya da **A5 kâğıt**.
- **A4'ün yarısı** seçiliyken kâğıt A4 gönderilir ve çıktı A4'ün üst yarısına (210 × 148,5 mm) yatay basılır. Önceden A4 takılı yazıcı A5 sayfayı A4'ün ortasına küçük basıyordu.
- Dikey tasarlanan adres etiketi üst yarıya sığsın diye 90° döndürülerek basılır.
- Barkod çıktısında kartlar A4'ün üst yarısına dizilir; sığmayanlar sonraki A4 sayfaya geçer.
- Önizleme seçilen kâğıdı gösterir; A4'ün ortası kesik çizgiyle işaretlidir.
- Seçilen kâğıt, yazıcı gibi o bilgisayarda hatırlanır. İlk kullanımda **A4'ün yarısı** seçili gelir.

## Teknik notlar

- `lib/yazdir.js` her iş için iki sayfa üretir (`kagitlar.a5`, `kagitlar.a4yari`). A4 yarısında kenarsız sayfa `@page { size: A4 portrait; margin: 0 }` ile 210 × 148,5 mm'ye kırpılır; kenar boşluklu sayfada alt kenar boşluğu sayfanın alt yarısını kapatır.
- `desktop/a5Yazdir.js` `kagit: "A4" | "A5"` alır; A4'te yön her zaman dikeydir.
- Çıktı Electron `printToPDF` ile yatay etiket, dikey etiket ve 9 cihazlı barkod sayfası için kontrol edildi.
