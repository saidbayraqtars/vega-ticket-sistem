# Vega Müşteri İşlemleri — Devir Teslim

Güncelleme: **01.09.2026**

Sürüm: **1.2.2**

Durum: **üretim paketi hazır**

## Güncel iş akışı

- Şirket içindeki müşteri aramalarında yapılan işlem ve söylenen ücret kaydedilir.
- Açık/kapalı yönetimi, öncelik, kategori, atama, tahsilat ve otomatik fatura yoktur.
- Yeni işlem veritabanına doğrudan tamamlanmış ve kapanış tarihli yazılır.
- İşlem geçmişinde yalnız tamamlanan kayıtlar gösterilir.
- Müşteri listesi Excel görünümündedir; büyük arama alanı ve dönemsel borç durumu içerir.
- Cari seçildiğinde anlaşmalı/yeni müşteri durumu özel koddan türetilip belirgin gösterilir.
- Anlaşmalı yazım türevleri otomatik 12 aya düşer; yalnız yeni müşteriye 1–12 ay özel süre verilir.
- İşlem kaydından sonra GSM öncelikli numaraya QR bağlantılı WhatsApp bildirimi gönderilir; başarısız gönderim aynı ticketı çoğaltmadan yeniden denenebilir.
- WhatsApp oturumu yalnız ortak ayarda seçilen ana bilgisayarın kullanıcı profilindedir. İstemciler mesajı `VEGATICKETDB.dbo.WHATSAPPMESAJLARI` kuyruğuna bırakır; ayrı QR okutmaz. Tickettan sonra 30 dakika içinde gönderilemeyen mesaj SQL Server saatine göre iptal edilir.
- WhatsApp bağlantı durumu, QR ve oturum sıfırlama yalnız Ayarlar ekranındadır; müşteri detayında yalnız işlem sonrası gönderim sonucu gösterilir.

## Veri sınırı

- `VEGADBozdemirkaya`: salt-okunur müşteri kartları ve dönem hareketleri.
- `VEGATICKETDB.dbo.TICKETLER`: tamamlanmış işlem kayıtları.
- `VEGATICKETDB.dbo.CARISURELERI`: firma/cari bazında başlangıç ve 1–12 aylık süre.
- `VEGATICKETDB.dbo.TICKETLOG`: denetim izi.
- `VEGATICKETDB.dbo.WHATSAPPAYARLARI`: ana bilgisayar ve ortak bağlantı durumu.
- `VEGATICKETDB.dbo.WHATSAPPMESAJLARI`: merkezi WhatsApp gönderim kuyruğu.

Eski ticket kolonları geçmiş veri uyumluluğu için korunur ancak yeni arayüzde gösterilmez ve API üzerinden değiştirilemez.

## Doğrulama

- Otomatik test: 20/20.
- Bağımlılık güvenlik denetimi: kök, sunucu, istemci ve masaüstünde 0 açık.
- Canlı Özdemirkaya doğrulaması: 39.190 cari, dönem bakiyesi, 1 ve 12 aylık süre, tamamlanmış işlem ve `ROWVERSION` kısıtı.
- Test süreleri ve işlem/log kayıtları doğrulama sonunda fiziksel olarak temizlendi.
- Vega tablolarına yazılmadı.

## Dağıtım

- Kurulum: `dist\Vega Ticket Setup 1.2.2.exe`
- Açılmış uygulama: `dist\win-unpacked\Vega Ticket.exe`
- Özel uygulama ikonu ve kurumsal kod-imzalama sertifikası henüz yoktur.
- Kaynak depo: özel `saidbayraqtars/vega-ticket-sistem`.
- Güncelleme deposu: açık `saidbayraqtars/vega-ticket-sistem-releases`.
- Paketli uygulama `electron-updater` ile yeni sürümü indirir ve kullanıcı onayıyla kurar.

Kullanım ve API ayrıntıları [README.md](README.md), Vega şema kanıtları [SEMA-DOGRULAMA.md](SEMA-DOGRULAMA.md) dosyasındadır.
