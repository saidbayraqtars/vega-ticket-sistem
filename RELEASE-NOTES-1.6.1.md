# Vega Ticket 1.6.1

## WhatsApp ana bilgisayarı arka planda çalışır

- WhatsApp mesajlarını gönderen ana bilgisayarda pencere kapatılınca program kapanmaz; saatin yanındaki simgeye iner ve mesaj göndermeye devam eder. İlk kapatmada bununla ilgili bildirim gösterilir.
- Simgeye tıklanınca pencere yeniden açılır. Sağ tık menüsündeki **Tamamen kapat**, mesajların gönderilmeyeceği uyarısıyla onay ister.
- Ana bilgisayarda program Windows açılışında pencere göstermeden kendiliğinden başlar. Ayar, program bu bilgisayarın ana bilgisayar olduğunu ilk anladığında yapılır; güncellemeden sonra programın bir kez açılması yeterlidir.
- Diğer bilgisayarlarda davranış değişmedi: pencere kapanınca program kapanır. Bir bilgisayar ana bilgisayar olmaktan çıkarsa Windows açılışı ayarı da kaldırılır.

## Kararlılık

- Arka plan sunucusu beklenmedik şekilde kapanırsa 3 saniye sonra kendiliğinden yeniden başlar. 10 dakikada 5 defadan fazla kapanırsa hata gösterilir.
- Program simgedeyken indirilen güncelleme bildirimle haber verilir; kurulum pencere açıldığında sorulur.

## Teknik notlar

- Sunucu, bilgisayarın WhatsApp ana bilgisayarı olup olmadığını Electron ana sürecine IPC ile bildirir. HTTP kullanılmadı, çünkü PIN tanımlı kullanıcıda API uçları oturum ister.
- Sunucu testleri 75/75 başarılıdır. Gizli başlangıç, ana olmayan bilgisayarda tam kapanma ve ana bilgisayarda simgeye inme davranışları geliştirme ortamında denenmiştir.
