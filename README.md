# Vega Müşteri İşlemleri

Şirket içinde arayan müşteriler için yapılan işlemi ve söylenen ücreti kaydeden Electron uygulaması.

## İş akışı

- Açık/kapalı, öncelik, kategori, atanan kişi ve tahsilat aşaması yoktur.
- Kayıt girildiği anda tamamlanmış işlem olarak saklanır.
- İşlem formunda yalnız **Yapılan işlem** ve **Söylenen ücret** bulunur.
- Uygulama fatura oluşturmaz ve Vega fatura tablolarına yazmaz.
- Tamamlanan işlemler ekranında yalnız bitmiş kayıtlar gösterilir.
- Müşteriler, üstte büyük arama alanı ve Excel benzeri listeyle gösterilir.
- Cari borç durumu seçilen dönemdeki `SUM(BORC) - SUM(ALACAK)` toplamından hesaplanır.
- Cari seçildiğinde özel koddaki müşteri türü büyük ve renkli olarak gösterilir.
- `ANLAŞMALI`, `ANTLAŞMALI`, `ANLAŞMA` ve `SÖZLEŞMELİ` gibi yazım türevleri anlaşmalı kabul edilir; süre otomatik 12 aydır.
- Yalnız özel kodu `YENİ MÜŞTERİ` olan cariye başlangıç tarihinden itibaren 1–12 ay süre verilebilir.
- İşlem kaydedilince WhatsApp bildirimi ortak `VEGATICKETDB` kuyruğuna alınır. QR yalnız **Ayarlar → WhatsApp bağlantısı** bölümünden seçilen ana bilgisayarda okutulur; diğer bilgisayarlar QR istemeden aynı ana bilgisayar üzerinden gönderir. İlk 30 dakikada gönderilemeyen bildirim iptal edilir.

Vega veritabanı salt-okunurdur. İşlem kayıtları, süreler ve loglar ayrı `VEGATICKETDB` veritabanında tutulur.

## Veri modeli

- `dbo.TICKETLER`: geçmiş uyumluluk kolonlarını korur; yeni kayıtlar doğrudan `KAPALI` ve kapanış tarihli yazılır.
- `dbo.CARISURELERI`: firma/cari bazında başlangıç tarihi ve 1–12 aylık süre.
- `dbo.TICKETLOG`: kayıt ve düzenleme günlüğü.
- `dbo.WHATSAPPAYARLARI`: tüm istemcilerin kullandığı tek ana WhatsApp bilgisayarı ve bağlantı kalp atışı.
- `dbo.WHATSAPPMESAJLARI`: merkezi gönderim kuyruğu, deneme/hata/gönderim/iptal durumu.
- Vega `TBLCARI`: müşteri kartı için salt-okunur.
- Vega `TBLCARIHAREKETLERI`: seçilen dönem borç/alacak bakiyesi için salt-okunur.

Firma ve dönem sabit değildir; kurulum veya Ayarlar ekranından seçilir.

## Mimari

```text
server/   Express + mssql; Vega ve VEGATICKETDB için ayrı bağlantı havuzları
client/   React + Vite + Tailwind; Excel benzeri müşteri ve işlem tabloları
desktop/  Electron + electron-builder
```

Sunucu yalnız `127.0.0.1:3010` üzerinde dinler. Çok kullanıcılı düzenlemede `ROWVERSION` ile çakışma denetimi, dört saniyelik değişiklik yoklaması ve işlem logu kullanılır.

## Geliştirme ve doğrulama

```bash
npm install
npm install --prefix server
npm install --prefix client
npm install --prefix desktop

npm test --prefix server
npm run build --prefix client
npm run dist
```

Kurulum çıktısı `dist/Vega Ticket Setup 1.2.2.exe` dosyasıdır. Kullanıcı ayarları ve makineye özel WhatsApp oturumu `%APPDATA%/vega-ticket-desktop` altında tutulur.

### GitHub release ve otomatik güncelleme

Kurulu uygulama açılıştan sonra `saidbayraqtars/vega-ticket-sistem-releases`
deposundaki yeni sürümü kontrol eder, arka planda indirir ve kullanıcı onayıyla
yeniden başlatıp kurar.

Yeni sürüm yayınlama sırası:

```bash
# package.json sürümlerini yükselt
npm test --prefix server
npm run build --prefix client
npm run release
```

Kök yayın betiği sürüm tag'ini release deposunda hazırlar, testleri çalıştırır,
istemciyi derler ve Electron kurulumunu GitHub'a yükler. Komut için GitHub
yazma yetkili `GH_TOKEN` bulunmalıdır. Kaynak kod
`saidbayraqtars/vega-ticket-sistem`, kurulum dosyaları ise ayrı ve herkese açık
`saidbayraqtars/vega-ticket-sistem-releases` deposundadır.

## API özeti

| Uç | İşlev |
|---|---|
| `GET /api/cari/liste?firma=&donem=` | Dönem bakiyeli müşteri listesi |
| `GET /api/cari/ara?firma=&donem=&q=` | Türkçe duyarlı müşteri araması |
| `GET /api/cari/:ind?firma=&donem=` | Müşteri, bakiye, süre ve bitmiş işlemler |
| `PUT /api/cari/:ind/sure` | 1–12 aylık müşteri süresi kaydetme |
| `DELETE /api/cari/:ind/sure` | Uygulamaya özel süreyi kaldırma |
| `GET /api/ticket?firma=` | Yalnız tamamlanmış işlemler |
| `POST /api/ticket` | Tamamlanmış işlem kaydı ve WhatsApp bildirimi |
| `PATCH /api/ticket/:id` | Yalnız işlem metni/ücret güncelleme; `RV` zorunlu |
| `GET /api/ticket/degisiklikler` | Çok kullanıcılı canlı değişiklikler |
| `GET /api/whatsapp/durum` | Ortak bağlantı durumu; QR yalnız seçili ana bilgisayara döner |
| `POST /api/whatsapp/ana-yap` | Bu bilgisayarı ortak ana WhatsApp bilgisayarı seçme |
| `GET /api/whatsapp/mesaj/:ticketId` | Merkezi kuyruktaki mesaj durumunu okuma |
| `POST /api/whatsapp/gonder` | İlk 30 dakika içindeki başarısız işlem bildirimini ticket kimliğiyle tekrar gönderme |
| `POST /api/whatsapp/sifirla` | Yalnız ana bilgisayardaki WhatsApp oturumunu sıfırlama |

Vega sorgu kuralları ve canlı şema kanıtları: [SEMA-DOGRULAMA.md](SEMA-DOGRULAMA.md).
