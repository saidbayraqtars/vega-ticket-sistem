# Vega Ticket 1.9.3

## WhatsApp ban koruması

- **Kısıtlanan numaraya bağlanma durur.** WhatsApp numarayı kısıtlarsa (403), oturum telefondan kapatılırsa (401) ya da aynı oturum başka yerde açılırsa (440) uygulama artık otomatik olarak yeniden bağlanmaz. Önceden 403'te 30 saniyede bir sonsuza kadar deniyordu; bu, geçici kısıtlamayı kalıcı bana çevirebilir. Durum uygulama yeniden başlasa da (güncelleme, Windows açılışı) korunur.
- WhatsApp ayarlarında durum **DURDURULDU** görünür. Numara telefonda açıldıktan sonra ana bilgisayarda **Yeniden bağlan** düğmesine basılır; oturum silinmez, QR gerekmez. Oturum kapatıldıysa (401) **Oturumu sıfırla** ile QR yeniden okutulur.
- **Gönderim hız sınırı.** Mesaj numaralara art arda değil, aralarında 20-45 saniye rastgele beklemeyle gider. Saatte en çok 30, 24 saatte en çok 150 gönderim yapılır; her numaraya gidiş bir gönderim sayılır.
- Sınır dolunca kuyruk bekler ve tüm bilgisayarlarda "Saatlik 30 gönderim sınırı doldu; sıradaki gönderim HH:MM sonrası." açıklaması görünür. 30 dakikalık gönderim penceresi aynen geçerlidir.
- "Numara WhatsApp'ta var mı" sorgusu her gönderimde tekrarlanmaz: sonuç kayıtlı numara için 7 gün, kayıtsız numara için 1 gün hatırlanır.

## Teknik notlar

- `server/lib/whatsapp.js`: `DURDURAN_KODLAR` (401/403/440). Durdurma `whatsapp-auth/durduruldu.json` dosyasına yazılır; `baslat()` bu kayıt varken bağlanmaz. Oturum sıfırlanınca dosya klasörle silinir. Önceden 401 sonrasında da döngü her turda `baslat()` çağırıp yeniden bağlanıyordu; bu da kapandı.
- Yeni uç `POST /api/whatsapp/yeniden-baglan` (yalnız ana bilgisayar).
- `server/lib/whatsappHiz.js`: kayan pencereli saatlik/günlük sınır ve rastgele aralık. Gönderim zamanları `whatsapp-gonderimler.json` dosyasında tutulur, yeniden başlatmada sayaç sıfırlanmaz. Bir mesaj en çok üç numaraya gittiği için kuyruktan mesaj ancak üç gönderimlik yer varken alınır.
- Sunucu testleri 118/118 başarılıdır.

## Güncelleme notu

Korumalar WhatsApp gönderen **ana bilgisayarda** çalışır. Önce ana bilgisayarı güncelleyin.
