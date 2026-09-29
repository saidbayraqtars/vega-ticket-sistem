# Vega Ticket 1.9.0

## Tamamlanan işlemi onaya geri alma

- **Onay bekleyenler** ekranında çift tıklamayla tamamlanan işlem artık yine çift tıklamayla geri alınabilir. **Tamamlanan işlemler** ekranında satıra çift tıklayınca kayıt **Onay bekleyenler**e döner.
- Müşteriye iletilen işlem, şirket içi not ve söylenen ücret hücreleri tek tıkla düzenlemeye açıldığı için çift tıklama **tarih, müşteri veya kaydeden** hücresinde yapılır.
- Geri alınan kaydın kapanış tarihi ve onaylayan bilgisi temizlenir. WhatsApp mesajı yeniden gönderilmez.
- Kaydı aynı anda başka bir kullanıcı geri aldıysa uyarı çıkar. Diğer bilgisayarlarda kayıt birkaç saniye içinde doğru listeye geçer.

## Servis kabulünde teslim onayı

- Servis kabulüne yeni sekme eklendi: **Teslim onayı bekleyenler**. "Teslim et" denen kayıt önce buraya düşer ve durumu "Teslim edildi · onay bekliyor" olarak görünür.
- Bu sekmede satıra çift tıklayınca teslim onaylanır ve kayıt **Teslim edilenler**e geçer. Onaylayan kişi ve onay tarihi kayda yazılır, detayda görünür.
- **Teslim edilenler**de satıra çift tıklayınca kayıt onaya geri döner.
- Kaydın durumu sonradan değiştirilirse (ör. yeniden işleme alınırsa) onay düşer; yeniden teslim edilince tekrar onay bekler.
- Bu sürümden önce teslim edilmiş kayıtlar onaylı sayılır; onay listesinde birikmez.
- Servis ekranı listeyi kendiliğinden yenilemez. Başka bilgisayarda yapılan teslim, sekme değiştirilince ya da **Tazele** ile görünür.

## Teknik notlar

- Yeni uçlar: `POST /api/ticket/:id/geri-al`, `POST /api/servis/:id/onayla`, `POST /api/servis/:id/geri-al`. `GET /api/servis` yeni `teslimOnay` listesini tanır; onay bekleyen teslimler adetlerde `TESLIM_ONAY` anahtarıyla sayılır.
- `SERVISKAYITLARI` tablosuna `ONAYLAYAN` ve `ONAYTARIHI` kolonları eklenir. Şema ilk açılışta kendiliğinden yükseltilir, veri kaybı olmaz.
- Sunucu testleri 112/112 başarılıdır.
