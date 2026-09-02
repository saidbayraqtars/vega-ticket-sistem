# Vega Ticket 1.2.1

- WhatsApp yeniden gönderimi ticket kimliğine bağlandı; işlem metni ve kayıt zamanı istemciden değil `VEGATICKETDB.dbo.TICKETLER` tablosundan okunur.
- Bildirim yalnız işlem kaydının ilk 30 dakikasında gönderilebilir. Tam 30 dakika dolduğunda sunucu HTTP 410 ile gönderimi iptal eder.
- İptal edilen bildirimde arayüz yeniden gönderme düğmesini kaldırır.
- WhatsApp oturumunun merkezi olmadığı ve her istemci makinede ayrı QR okutulması gerektiği belgelendi.
- Sunucu testleri 20/20 ve istemci üretim derlemesi başarılıdır.
