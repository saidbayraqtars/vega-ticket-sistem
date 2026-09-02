# Vega Ticket 1.2.0

- Cari detayında **ANLAŞMALI MÜŞTERİ / YENİ MÜŞTERİ / TÜR TANIMLANMAMIŞ** durumu belirginleştirildi.
- `antlaşmalı`, `anlaşma`, `sözleşmeli` ve Türkçe karaktersiz eşdeğerleri anlaşmalı olarak tanınır.
- Anlaşmalı müşteriye otomatik 12 ay uygulanır; özel süre girişi yalnız yeni müşteriye açıktır ve sunucu tarafından da zorlanır.
- İşlem kaydedildikten sonra carinin GSM, yoksa telefon alanındaki cep numarasına uzak bağlantı çözüm mesajı gönderilir.
- WhatsApp bağlantısı örnek Vega uygulamasındaki gibi Baileys ve QR oturumuyla çalışır. Gönderim başarısızsa ticket kaydı korunur ve mesaj yeniden gönderilebilir.
- Sunucu testleri 18/18, istemci üretim derlemesi ve bağımlılık denetimi başarılıdır.
