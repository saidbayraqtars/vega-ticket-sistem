# Vega Ticket 1.4.1

## Şehir dışı kargo takibi

- Servis kayıtlarına **Kargoda** durumu eklendi.
- Servis detayındaki **Kargoda yap** düğmesiyle şehir dışına gönderilen cihazlar işaretlenebilir.
- Kargodaki kayıtlar açık servis listesinde kalır ve liste ile detay ekranında mor durum rozetiyle görünür.
- Mevcut `SERVISKAYITLARI` ve `CIHAZLAR` durum kısıtları uygulama açılışında veri kaybı olmadan yükseltilir.

## Teknik doğrulama

- Sunucu testleri 55/55 başarılıdır.
- İstemci production derlemesi başarılıdır.
