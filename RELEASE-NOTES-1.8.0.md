# Vega Ticket 1.8.0

## Servis kabulünde müşteriyi sonradan değiştirme

- Kabul kaydı açılırken yanlış cari seçildiyse kayıt silinip yeniden açılmaz. Servis kaydının detayında müşteri adının yanındaki **Müşteriyi değiştir…** düğmesiyle arama kutusu açılır, doğru cari seçilir ve kayıt ona taşınır.
- Müşteri adı ve kodu Vega kartından yeniden okunur; elle yazılmaz.
- Telefon ve yetkili alanları olduğu gibi kalır, gerekiyorsa ayrıca güncellenir. Daha önce basılmış etiketlerde eski ad yazdığı için etiketin yeniden basılması gerekebilir.
- Kaydı aynı anda başka bir kullanıcı değiştirdiyse uyarı çıkar ve kaydın güncel hali yüklenir.

## Kabul mesajı varsayılan olarak işaretli

- Yeni servis kabulü ekranındaki **Kayıttan sonra müşteriye WhatsApp kabul mesajı gönder** kutusu artık varsayılan olarak işaretlidir. Mesaj gönderilmesi istenmeyen kayıtta tik kaldırılır.
- Seçim o bilgisayarda hatırlanır. Kutu işaretliyken de mesaj kendiliğinden gitmez: kayıttan sonra mesaj penceresi açılır, metin ve numaralar görülüp onaylanır.

## Şirket içi not kutusu

- Servis kaydı detayına **Şirket içi notlar** bölümü eklendi. Müşteriye sunulan fiyat teklifi, cihaza yapılan işlem ve iç notlar buraya yazılır.
- Not türü seçilir: **Fiyat teklifi**, **Yapılan işlem** veya **İç not**. Teklife tutar yazılabilir; tutar isteğe bağlıdır ve sonradan eklenebilir. Tutar "1.250,00" ya da "1250.5" biçiminde yazılabilir.
- Başlıkta en son verilen teklif tutarı rozet olarak görünür. Notlar en yenisi üstte listelenir, kimin yazdığı ve saati yanında durur; düzenlenebilir ve kaldırılabilir.
- Bu metinler **müşteriye gönderilmez**. WhatsApp kuyruğuyla ilgisi yoktur, yalnız programı kullanan çalışanlar görür.

## Teknik notlar

- Yeni tablo: `SERVISNOTLARI` (tür, metin, tutar, yazan, tarih; kaldırılan not satırı silinmez, işaretlenir). Şema ilk açılışta kendiliğinden yükseltilir, veri kaybı olmaz.
- `PATCH /api/servis/:id` artık `CARIIND` alanını da kabul eder; ad ve kod sunucuda cari kartından doldurulur. Yeni uçlar: `POST /api/servis/:id/notlar`, `PATCH` ve `DELETE /api/servis/not/:id`.
- Sunucu testleri 106/106 başarılıdır.
