# Vega Ticket 1.3.1

- Etiket artık servis kabulü kaydedilirken kendiliğinden basılmıyor. Her kayıtta cihaz başına etiket çıkması kâğıt harcıyordu; baskıyı kullanıcı başlatır.
- Kayıt açılınca sağdaki detay paneli o kayıtla seçili gelir. Etiket oradan cihaz başına ("Etiket bas") veya toptan ("Tüm etiketleri bas") çıkarılır.
- Kaydet düğmesinin adı "Kaydet ve etiket bas" yerine "Kaydet" oldu; kayıt sonrası mesaj etiketin nereden basılacağını söylüyor.

Etiket basıldığında cihaz satırında basım tarihi ve adedi görünmeye devam ediyor, aynı etiket yanlışlıkla iki kez çıkarılmasın diye.

Sunucu testleri 47/47, istemci üretim derlemesi başarılıdır.
