# Vega Ticket 1.5.0

## Müşteri listesi

- Vega'da özel kod 1'e yazılan **ANLAŞMALI / YENİ MÜŞTERİ** bilgisi artık en geç bir dakikada ekrana yansır. Sunucu kart tablosunun değişiklik imzasını 15 saniyede bir kontrol eder, açık ekran dakikada bir kendini tazeler.
- Pasif cariler listelenmez; yalnız Vega'da aktif işaretli kartlar gelir.
- Tüm sütunlar sıralanabilir. Başlığın altındaki kutularla cari kodu, ad, müşteri türü, borç durumu ve süre durumuna göre filtrelenir. Seçmeli filtrelerde her seçeneğin adedi görünür.

## Tüm listelerde sıralama ve filtre

- Onay bekleyenler, tamamlanan işlemler ve servis listeleri başlığa tıklanarak sıralanır, sütun kutularıyla filtrelenir. Türkçe karakter farkı aramayı etkilemez.

## WhatsApp

- Her ekranın üstünde WhatsApp bağlantı durumu ile oturumun hangi kullanıcıda ve bilgisayarda açık olduğu görünür. Göstergeye tıklanınca bağlantı ve şablon penceresi açılır.
- Mesaj şablonunu tüm kullanıcılar düzenleyebilir; son düzenleyen kişi görünür.
- Onay bekleyen kayıtların WhatsApp mesajı ✎ ile düzenlenebilir. Henüz gönderilmemiş mesajda kuyruktaki metin de güncellenir; gönderilemeyen mesaj tek tıkla yeniden gönderilir.

## İsteğe bağlı PIN girişi

- Her kullanıcı 4-6 haneli giriş PIN'i belirleyebilir, değiştirebilir veya kaldırabilir.
- PIN tanımlı kullanıcıdan uygulama açılışında ve kullanıcı değiştirirken PIN istenir. Art arda beş yanlış denemede giriş bir dakika kilitlenir. PIN yalnız tuzlanmış scrypt özeti olarak saklanır.

## Servis: arızaya gönderim ve kargo

- **Arızaya gönderilenler** ile **Kargoya verilenler** ayrı sekmelerde izlenir; her sekmede kayıt adedi görünür.
- Durum adları netleştirildi: Kabul edildi, İşlemde, Teslime hazır, Arızaya gönderildi, Kargoya verildi, Teslim edildi, İptal edildi.
- Arızaya gönderme ve kargoya verme penceresinde alıcı, adres, kargo firması ve takip numarası girilir. Daha önce kullanılan servis adresleri listeden seçilir; kargoda müşteri adresi Vega kartından önerilir.
- **A5 adres etiketi**: gönderen, alıcı, servis numarası barkodu, takip numarası barkodu ve cihaz listesi.
- **A5 barkod çıktısı**: her cihaz için ayrı Code 128 barkod kartı.
- Her gönderim geçmişte ayrı satır olarak saklanır; takip numarası sonradan girilebilir.

## Teknik notlar

- `VEGATICKETDB` şeması açılışta veri silmeden yükseltilir: yeni `SERVISGONDERIMLERI` ve `ORTAKAYARLAR` tabloları, `ARIZADA` durumu, WhatsApp oturum kullanıcısı ve PIN güncelleme tarihi kolonları. Vega ERP tabloları salt okunur kalır.
- Sunucu testleri 70/70 başarılıdır. Uçtan uca API denemesinde 28/28 kontrol geçmiştir.
- Code 128 çıktısı bağımsız bir barkod kütüphanesiyle karşılaştırılarak doğrulanmıştır.

## Geri dönüş notu

`1.4.1`, `ARIZADA` durumundaki servis kayıtlarını tanımlı bir durum olarak göstermez ve gönderim geçmişini okumaz. Geri dönüş gerekirse bu kayıtların durumu önce kontrollü biçimde değiştirilmelidir.
