# Vega Müşteri İşlemleri 1.1.0

Yayın tarihi: 01.09.2026

## Değişiklikler

- Açık/kapalı, öncelik, kategori, atama ve tahsilat iş akışı kaldırıldı.
- İşlemler doğrudan tamamlanmış kayıt olarak saklanıyor.
- İşlem formu yalnız yapılan işlem ve söylenen ücret alanlarına indirildi.
- Otomatik fatura üretimi bulunmadığı doğrulandı.
- Tamamlanan işlemler sayfası sadeleştirildi.
- Excel benzeri müşteri listesine dönemsel borç durumu eklendi.
- Üst bölüme büyük müşteri araması eklendi.
- Yeni müşterilere 1–12 ay arasında özel süre tanımlama eklendi.
- SQL `DATE` değerlerindeki Türkiye saat dilimi kaynaklı gün kayması giderildi.
- GitHub release kanalı ve uygulama içi otomatik güncelleme sistemi eklendi.

## Doğrulama

- 13/13 otomatik test geçti.
- İstemci üretim derlemesi geçti.
- Tüm npm güvenlik denetimleri 0 açık verdi.
- Canlı Özdemirkaya bağlantısında veri ve API akışları doğrulandı.
- Paket içindeki sunucu ve arayüz dosyaları kaynaklarla hash bazında eşleşti.
