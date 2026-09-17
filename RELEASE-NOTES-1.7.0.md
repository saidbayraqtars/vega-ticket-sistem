# Vega Ticket 1.7.0

## Etiketi başka bilgisayardaki yazıcıdan basma

- Termal etiket yazıcısı tek bir bilgisayara bağlıysa diğer bilgisayarlar da etiket basabilir. Bilgisayarların birbirine bağlı olması gerekmez; iş ortak SQL Server üzerinden iletilir.
- **Yazıcının bağlı olduğu bilgisayarda:** Etiket yazıcısı ayarında "Bu bilgisayara bağlı yazıcıda" seçiliyken yazıcıyı seçin, **Bu yazıcıyı diğer bilgisayarlara aç** kutusunu işaretleyip kaydedin. Bu bilgisayarda pencere kapatılınca program kapanmaz, saatin yanındaki simgeye iner ve gelen etiketleri basmaya devam eder. Windows açılışında da kendiliğinden başlar.
- **Diğer bilgisayarlarda:** **Başka bilgisayara bağlı yazıcıda** seçeneğini seçin, listeden etiket bilgisayarını seçip kaydedin ve **Deneme etiketi gönder** ile deneyin. Listede etiket bilgisayarının çevrim içi olup olmadığı ve etiket düzeninin önizlemesi görünür.
- Servis ekranındaki **Etiket bas** artık etiketi seçilen bilgisayara gönderir. Ekranın üstünde "sırada", "basıldı" veya hata mesajı görünür. Basılamayan etiket **Tekrar gönder** ile yeniden gönderilir.
- Etiket bilgisayarı kapalıysa etiket 10 dakika bekler, sonra iptal edilir. Böylece bilgisayar saatler sonra açıldığında eski etiketler basılmaz.
- Program baskı sırasında kapanırsa etiket kendiliğinden tekrar basılmaz; hata olarak gösterilir, etiketin çıkıp çıkmadığı kontrol edilip gerekirse tekrar gönderilir.

## Termal etikete logo

- Termal etikete logo eklenebilir. Logo ve yazı bloğu önizlemede fareyle sürüklenerek ya da mm olarak yerleştirilir; yazı bloğunun genişliği ve yazı boyutu değiştirilebilir.

## A5 adres etiketi tasarımı

- Servis ekranındaki **A5 etiket tasarımı** ile gönderen ve alıcı kutuları, logo, "Dikkat kırılır" işareti, servis/kargo satırı, barkod ve cihaz listesi sürüklenerek yerleştirilir. Yatay veya dikey A5 seçilebilir.
- Tasarım tüm bilgisayarlarda ortaktır. Gönderen bilgisine yetkili ve e-posta alanları eklendi.

## Servis kaydından WhatsApp mesajı

- Servis kaydından müşteriye isteğe bağlı WhatsApp mesajı gönderilir. Mesaj türü seçilir (kabul edildi, teslime hazır, yetkili servise gönderildi, kargoya verildi, teslim edildi, genel); metin kayıt bilgileriyle doldurulur ve göndermeden önce düzenlenebilir. Numaralar seçilebilir, elle numara eklenebilir.
- Hiçbir durum değişikliği kendiliğinden mesaj göndermez. Kabul, teslime hazır, arıza ve kargo işlemlerinden sonra yalnız "WhatsApp ile bildir" önerisi çıkar.
- Servis mesajları kayıt detayında durumlarıyla listelenir: sıradaki mesaj düzenlenir veya iptal edilir, gönderilemeyen mesaj yeniden gönderilir.
- Her mesaj türünün şablonu WhatsApp ayarlarındaki **Servis mesaj şablonları** bölümünden düzenlenir.

## Teknik notlar

- Yeni tablolar: `ETIKETYAZICILARI` (yazıcısını paylaşan bilgisayarlar), `ETIKETISLERI` (etiket baskı kuyruğu). `WHATSAPPMESAJLARI` tablosuna `SERVISID`, `MESAJTURU`, `GONDEREN` kolonları eklendi ve `TICKETID` boş olabilir hale geldi. Şema ilk açılışta kendiliğinden yükseltilir.
- Etiket kuyruğu işleri `UPDLOCK/READPAST` ile alır; aynı etiket iki kez basılmaz. Etiket metni kuyrukta saklanmaz, etiket bilgisayarı basarken kaydı veritabanından okur.
- Uzak baskı için bütün bilgisayarların 1.7.0'a güncellenmesi gerekir.
- Sunucu testleri 99/99 başarılıdır. Uzak etiket akışı geliştirme veritabanında sahte etiket bilgisayarıyla uçtan uca denenmiştir (paylaşım, deneme etiketi, servis ve seçili cihaz etiketi, yazıcı hatası ve tekrar gönderme, eşzamanlı iş alma, süre dolumu, yarıda kalan baskı, çevrim dışı). Gerçek yazıcıyla deneme kurulumda yapılmalıdır.
