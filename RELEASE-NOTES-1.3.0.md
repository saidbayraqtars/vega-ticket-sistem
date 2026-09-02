# Vega Ticket 1.3.0

## Servis kabulü ve etiket yazdırma (yeni)

- Müşteri cihazıyla geldiğinde servis kabul kaydı açılır: müşteri, getiren kişi, telefon ve bir kayda birden çok cihaz. Yeni `SERVISKAYITLARI` ve `CIHAZLAR` tabloları sunucu açılışında kendiliğinden kurulur.
- Servis numarası (`SRV-000001`) IDENTITY üzerinden hesaplanan kolonla üretilir; ayrı sayaç ve yarış koşulu yoktur.
- Her cihaz için yapışkan etiket basılır. Etikette üstte cari bilgisi (servis no, müşteri, telefon), ayıraç çizgi, altta cihaz ve arıza yer alır; vurgulu satırlar kalın basılır.
- Kabul kaydedilir kaydedilmez etiketler yazıcıya gider; ayrıca cihaz başına veya kayıt başına yeniden basılabilir.
- Kayıtlar KABUL / İŞLEMDE / HAZIR / TESLIM / İPTAL durumları arasında ilerletilir.

### Etiket yazıcısı

- İki basma yolu var. **Windows sürücüsü** (varsayılan) sürücüsü kurulu her yazıcıda çalışır, gerçek TrueType font ve gerçek kalın yazı verir, Türkçe için kod sayfası çevirisi gerektirmez. **Ham komut** yolu ZPL veya TSPL komutlarını doğrudan kuyruğa gönderir; sürücü etiketi yanlış ölçeklediğinde kullanılır.
- Yazıcı seçilmezse Windows varsayılan yazıcısına basılır.
- Varsayılan etiket 80×40 mm, 203 dpi, TSPL. INYY/ZYWELL ZY910 etiket modunda TSPL konuşur.
- Yerleşim etiket boyuna göre ölçeklenir; 80×40 mm etikete iki satırlık arıza notu dahil bütün alanlar sığar.
- Ham yolda Türkçe karakterler CP857 ile kodlanır; yazıcı desteklemiyorsa ASCII'ye indirgeme açılabilir.
- Yazıcının hangi dili konuştuğu bilinmiyorsa "Dili bul" aynı örneği hem ZPL hem TSPL olarak basar.
- Etiket ayarı bu bilgisayara özeldir; etiket, yazıcının bağlı olduğu makineden basılır.

## Performans

- **Açılış artık veritabanı bağlantısını beklemiyor.** Sunucu önce dinlemeye başlıyor, bağlantıyı arka planda kuruyor. Önceden üç havuzun zaman aşımı toplanıp Electron'un 30 saniyelik sınırını aşabiliyor ve uygulama "Sunucu yanıt vermedi" diyerek kapanabiliyordu.
- **Müşteri listesi 508 ms yerine 6 ms.** Her istekte 39 bin kart yeniden zenginleştirilip `localeCompare` ile sıfırdan sıralanıyordu; bu 132 ms CPU tutuyor ve tek iş parçacıklı sunucunun tamamını o süre boyunca kilitliyordu. Sonuç artık girdiler değişmedikçe yeniden kullanılıyor, sıralama `Intl.Collator` ile yapılıyor.
- **WhatsApp döngüsü boşta seyrekleşiyor.** Ana makinede iki saniyede beş sorgu atılıyordu; boşta 15 saniyeye geriliyor, kuyruğa mesaj girince anında hızlanıyor.
- Arayüz "bağlanıyor" ile "bağlantı yok" durumunu ayırt ediyor; açılışta kurulum ekranı yanlışlıkla açılmıyor.

## WhatsApp düzeltmeleri

- **Çift mesaj yarışı giderildi.** Kuyruk tazeleme sorgusu, ana makinenin göndermekte olduğu satırı da eziyordu; gönderim sonucu sessizce düşüyor, satır beklemeye dönüp müşteriye ikinci mesaj gidiyordu. Artık yalnız sahipsiz satırlar tazeleniyor.
- **Takılan talep eşiği 2 dakikadan 5 dakikaya çıkarıldı.** Tek gönderim 120 saniyeye kadar sürebildiği için uçuştaki mesaj kuyruğa geri dönüp tekrar gönderilebiliyordu. Süreç içinde gönderimi süren satırlar temizlikten hariç tutuluyor.
- Ayar değişikliği veya yeniden gönderme, uçuştaki turun üstüne ikinci tur açamıyor.
- Durum yoklaması, ana makinenin süren gönderimini artık iptale çeviremiyor.
- 30 dakikalık gönderim penceresi tek sabitten üretiliyor; JavaScript ile SQL arasında sapma kalmadı.

## Güvenlik

- **Kurulum paketi artık WhatsApp oturum anahtarlarını taşımıyor.** `whatsapp-auth/` klasörü `extraResources` kopyalamasından hariç tutuldu. Önceki sürümlerde QR okutulduktan sonra üretilen bir kurulum dosyası, onu kuran herkese oturumu açan anahtarları veriyordu.

**Bu sürüme geçenler:** WhatsApp → Bağlı cihazlar üzerinden mevcut oturumu düşürüp QR'ı yeniden okutun ve 1.2.x kurulum dosyalarını dağıtımdan kaldırın.

## Diğer

- Tamamlanan işlemler ekranından yanlış girilen kayıt silinebiliyor (onay kutusuyla, yumuşak silme).

Sunucu testleri 47/47, istemci üretim derlemesi başarılıdır.
