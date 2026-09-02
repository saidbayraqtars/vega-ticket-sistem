# Vega Ticket 1.2.2

- WhatsApp bağlantı durumu, QR kodu ve oturum sıfırlama müşteri detayından kaldırılıp Ayarlar ekranına taşındı.
- Müşteri detayında yalnız işlem sonrası gönderim sonucu ve gerekirse yeniden gönderme düğmesi kalır.
- WhatsApp oturumu yalnız Ayarlar'dan seçilen ana bilgisayarda açılır; diğer istemciler QR okutmaz.
- Tüm istemciler mesajları ortak `VEGATICKETDB` kuyruğuna bırakır, ana bilgisayar gönderir ve durum istemcilere geri yansır.
- 30 dakikalık iptal sınırı SQL Server saatiyle merkezi olarak zorlanır.
- WhatsApp kuyruğu geçici olarak yazılamasa bile tamamlanan işlem kaydı başarılı döner; kullanıcı aynı işlemi yanlışlıkla ikinci kez açmaz ve bildirimi yeniden deneyebilir.
- Sunucu testleri 22/22, istemci üretim derlemesi ve paketlenmiş 1.2.2 sağlık testi başarılıdır.
