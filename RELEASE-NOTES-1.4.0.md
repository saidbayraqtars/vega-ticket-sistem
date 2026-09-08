# Vega Ticket 1.4.0

## WhatsApp mesaj şablonu

- Ayarlar ekranına tüm bilgisayarlarda ortak kullanılan mesaj şablonu eklendi.
- `{firma}`, `{ad}`, `{unvan}`, `{kod}`, `{carikodu}`, `{islem}`, `{ucret}`, `{tarih}` ve `{kullanici}` değişkenleri tıklanarak şablona eklenebilir.
- Ticket ekranı müşteriye gönderilecek gerçek metni kayıt öncesinde gösterir; şablon o gönderim için ayrıca düzenlenebilir.
- WhatsApp mesajı ticket kaydedildiği anda merkezi kuyruğa alınır ve patron onayını beklemez. Gönderilen son metin ticket üzerinde saklanır.

## İşlem onayı ve aylık takip

- Yeni ticketlar önce **Onay bekleyenler** ekranına düşer.
- Patron satıra çift tıkladığında kayıt **Tamamlanan işlemler** ekranına taşınır. Bu işlem ikinci bir WhatsApp mesajı oluşturmaz.
- Tamamlanan işlemler varsayılan olarak yalnız geçerli ayı gösterir; geçmiş kayıtlar ay filtresiyle açılır.
- Bekleyen listede WhatsApp gönderim durumu ve gönderilen metin görünür.

## Teknik notlar

- `VEGATICKETDB` şeması veri silmeden, eklemeli olarak yükseltilir. Vega ERP tabloları salt okunur kalır.
- Sunucu testleri 53/53 başarılı, istemci production derlemesi başarılıdır.

## Geri dönüş notu

Önceki `1.3.1` kurulum dosyası GitHub Releases üzerinde korunur. Ancak `1.3.1`, yeni `ONAY_BEKLIYOR` kayıtlarını listeleyemez; geri dönüş gerekirse bu kayıtlar tamamlanana kadar `1.4.0` yeniden kullanılmalı veya durumları kontrollü biçimde taşınmalıdır.
