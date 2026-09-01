# Vega Müşteri İşlemleri — Devir Teslim

Güncelleme: **01.09.2026**

Sürüm: **1.1.0**

Durum: **üretim paketi hazır**

## Güncel iş akışı

- Şirket içindeki müşteri aramalarında yapılan işlem ve söylenen ücret kaydedilir.
- Açık/kapalı yönetimi, öncelik, kategori, atama, tahsilat ve otomatik fatura yoktur.
- Yeni işlem veritabanına doğrudan tamamlanmış ve kapanış tarihli yazılır.
- İşlem geçmişinde yalnız tamamlanan kayıtlar gösterilir.
- Müşteri listesi Excel görünümündedir; büyük arama alanı ve dönemsel borç durumu içerir.
- Yeni müşteriye uygulama içinden 1–12 ay süre verilebilir.

## Veri sınırı

- `VEGADBozdemirkaya`: salt-okunur müşteri kartları ve dönem hareketleri.
- `VEGATICKETDB.dbo.TICKETLER`: tamamlanmış işlem kayıtları.
- `VEGATICKETDB.dbo.CARISURELERI`: firma/cari bazında başlangıç ve 1–12 aylık süre.
- `VEGATICKETDB.dbo.TICKETLOG`: denetim izi.

Eski ticket kolonları geçmiş veri uyumluluğu için korunur ancak yeni arayüzde gösterilmez ve API üzerinden değiştirilemez.

## Doğrulama

- Otomatik test: 13/13.
- Bağımlılık güvenlik denetimi: kök, sunucu, istemci ve masaüstünde 0 açık.
- Canlı Özdemirkaya doğrulaması: 39.190 cari, dönem bakiyesi, 1 ve 12 aylık süre, tamamlanmış işlem ve `ROWVERSION` kısıtı.
- Test süreleri ve işlem/log kayıtları doğrulama sonunda fiziksel olarak temizlendi.
- Vega tablolarına yazılmadı.

## Dağıtım

- Kurulum: `dist\Vega Ticket Setup 1.1.0.exe`
- Açılmış uygulama: `dist\win-unpacked\Vega Ticket.exe`
- Özel uygulama ikonu ve kurumsal kod-imzalama sertifikası henüz yoktur.
- Kaynak depo: özel `saidbayraqtars/vega-ticket-sistem`.
- Güncelleme deposu: açık `saidbayraqtars/vega-ticket-sistem-releases`.
- Paketli uygulama `electron-updater` ile yeni sürümü indirir ve kullanıcı onayıyla kurar.

Kullanım ve API ayrıntıları [README.md](README.md), Vega şema kanıtları [SEMA-DOGRULAMA.md](SEMA-DOGRULAMA.md) dosyasındadır.
