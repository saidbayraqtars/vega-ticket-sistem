# Vega Ticket 1.6.0

## WhatsApp bildirimi üç numaraya

- İşlem kaydının WhatsApp mesajı artık carinin tek numarasına değil, kartta yazılı **en çok üç farklı cep numarasına** gider. TELEFON1/2/3, GSM ve yetkili telefonları taranır; aynı numara bir kez sayılır, sabit hatlar atlanır. Bir alana birden fazla numara yazılmışsa hepsi okunur.
- İşlem formunda mesajın gideceği numaralar listelenir. Caride uygun cep numarası yoksa kayıttan önce uyarı görünür.
- Numaralardan birine gönderilemezse durum "2/3 numaraya gönderildi. Gönderilemeyen: …" olarak gösterilir. **Tekrar gönder** yalnız mesajın ulaşmadığı numaralara gönderir; aynı kişiye ikinci mesaj gitmez.

## Müşteriye giden ile şirket içi not ayrıldı

- İşlem formu iki kutuya ayrıldı: mavi **Müşteriye gidecek** kutusunda yapılan işlem, WhatsApp şablonu, mesaj önizlemesi ve numaralar; sarı **Şirket içi not** kutusunda müşteriye hiç gönderilmeyen iç not.
- Şirket içi not onay bekleyenlerde, tamamlanan işlemlerde ve carinin geçmiş işlemlerinde ayrı sütun olarak görünür; tamamlanan işlemde düzenlenebilir.

## Türkçe karakterli kullanıcı adı

- Adında Ş, Ğ, İ, Ç, Ö, Ü gibi harfler olan kullanıcıyla girişte ve sonraki tüm işlemlerde oluşan hata giderildi.

## Telefon alanları

- Vega sürümüne göre değişen telefon kolonları kart tablosundan otomatik bulunur. Müşteri araması, servis kabulündeki telefon ve kargo alıcı telefonu bu alanların tümünü kullanır. Telefon değişikliği de 15 sn'lik kart imzasıyla yakalanır.

## Teknik notlar

- `VEGATICKETDB.WHATSAPPMESAJLARI` tablosuna açılışta veri silmeden `TELEFONLAR` ve `GONDERILENLER` kolonları eklenir. `TELEFON` ilk numarayı tutmaya devam eder.
- Kullanıcı adı `x-kullanici` başlığında URL-kodlu taşınır; sunucu eski istemcilerden gelen kodsuz başlığı da kabul eder.
- Sunucu testleri 75/75 başarılıdır.

## Güncelleme notu

WhatsApp gönderen **ana bilgisayar** 1.6.0'a güncellenmeden mesajlar yalnız ilk numaraya gider. Önce ana bilgisayarı güncelleyin.
