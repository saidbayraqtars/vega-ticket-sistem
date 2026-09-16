# Vega Müşteri İşlemleri — Devir Teslim

Güncelleme: **16.09.2026**

Sürüm: **1.6.0**

Durum: **üretim paketi hazır**

## Güncel iş akışı

- Şirket içindeki müşteri aramalarında müşteriye iletilen işlem, müşteriye gitmeyen şirket içi not (`TICKETLER.ACIKLAMA`) ve söylenen ücret kaydedilir. Yeni işlem `ONAY_BEKLIYOR` durumuyla onay listesine düşer, çift tıklanınca tamamlanır.
- Müşteri, onay, tamamlanan işlem ve servis listelerinin tümü başlığa tıklanarak sıralanır, sütun filtreleriyle süzülür. Müşteri listesinde sıralama/filtre sunucuda uygulanır (liste sayfalı).
- Müşteri türü Vega özel kod 1'den (`KOD1`) okunur. Anlaşmalı yazım türevleri otomatik 12 aya düşer; yalnız yeni müşteriye 1-12 ay süre verilir.
- Vega'daki kart değişikliği (tür, sözleşme tarihi, aktif/pasif) 15 sn'lik imza kontrolüyle yakalanır; açık ekran dakikada bir tazelenir. Pasif (`STATUS=2`) ve durumu boş kartlar listelenmez.
- WhatsApp oturumu yalnız ortak ayarda seçilen ana bilgisayardadır. İstemciler mesajı `WHATSAPPMESAJLARI` kuyruğuna bırakır. Mesaj carinin en çok üç farklı cep numarasına gider (`TELEFONLAR`); gidenler `GONDERILENLER`'e yazılır ve tekrar gönderimde atlanır. Her ekranın üstünde bağlantı durumu ile oturumun açık olduğu kullanıcı ve bilgisayar görünür.
- Mesaj şablonunu herkes düzenler; onay bekleyen kaydın mesajı ayrıca düzenlenebilir ve başarısızsa yeniden gönderilir. 30 dakikada gönderilemeyen mesaj SQL Server saatine göre iptal edilir.
- Kullanıcı isteğe bağlı 4-6 haneli PIN belirleyebilir. PIN'li kullanıcıya açılışta ve kullanıcı değiştirirken PIN sorulur; 5 yanlış denemede 1 dk kilit. Oturum yerel sunucunun belleğindedir, uygulama kapanınca düşer.
- Servis kabulünde her cihaz için termal etiket basılır. Kayıtlar Serviste / Arızaya gönderilenler / Kargoya verilenler / Teslim / İptal sekmelerinde izlenir.
- Arızaya gönderme ve kargoya verme alıcı bilgisiyle yapılır; her gönderim `SERVISGONDERIMLERI`'ne ayrı satır yazılır. A5 adres etiketi ve A5 barkod çıktısı normal yazıcıdan tarayıcı yazdırma penceresiyle alınır.

## Veri sınırı

- Vega veritabanı: salt-okunur müşteri kartları, dönem hareketleri, firma bilgisi.
- `VEGATICKETDB`: `TICKETLER`, `TICKETLOG`, `CARISURELERI`, `SERVISKAYITLARI`, `CIHAZLAR`, `SERVISGONDERIMLERI`, `WHATSAPPAYARLARI`, `WHATSAPPMESAJLARI`, `WHATSAPPMESAJAYARLARI`, `ORTAKAYARLAR`, `KULLANICILAR`.
- Şema her açılışta eklemeli ve idempotent yükseltilir; servis/cihaz durum kısıtları `lib/db.js` içindeki tek listeden üretilir.

Eski ticket kolonları geçmiş veri uyumluluğu için korunur ancak arayüzde gösterilmez ve API üzerinden değiştirilemez.

## Doğrulama (1.6.0)

- Sunucu testleri: 75/75 (çoklu numara seçimi, yarıda kalan gönderim tekrarlanınca mükerrer mesaj gitmemesi).

## Doğrulama (1.5.0)

- Sunucu testleri: 70/70.
- Geliştirme veritabanında uçtan uca API denemesi: 28/28 kontrol (filtre/sıralama, PIN kilidi, arızaya gönderim → kargo, `ROWVERSION` çakışması, mesaj düzenleme). Oluşturulan test kayıtları silindi.
- Code 128 çıktısı bağımsız bir barkod kütüphanesiyle karşılaştırıldı: birebir aynı.
- A5 adres etiketi ve barkod sayfası tek A5 sayfaya sığacak şekilde PDF çıktısıyla kontrol edildi.
- Canlı Vega veritabanında yalnız okuma yapıldı; özel kod 1 ve pasif kart dağılımı doğrulandı.

## Dağıtım

- Kurulum: `dist\Vega Ticket Setup 1.6.0.exe`
- Kaynak depo: özel `saidbayraqtars/vega-ticket-sistem`.
- Güncelleme deposu: açık `saidbayraqtars/vega-ticket-sistem-releases`.
- Paketli uygulama `electron-updater` ile yeni sürümü indirir ve kullanıcı onayıyla kurar.
- Özel uygulama ikonu ve kurumsal kod-imzalama sertifikası henüz yoktur.

Kullanım ve API ayrıntıları [README.md](README.md), Vega şema kanıtları [SEMA-DOGRULAMA.md](SEMA-DOGRULAMA.md) dosyasındadır.
